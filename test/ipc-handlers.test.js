const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  registerIpcHandlers,
} = require('../src/main/ipc-handlers');

const createHandlerRegistry = (dialogResult = { canceled: true, filePaths: [] }) => {
  const handlers = new Map();
  const ipcMain = {
    handle: (channel, handler) => handlers.set(channel, handler),
  };
  const dialog = {
    showOpenDialog: async () => dialogResult,
  };

  registerIpcHandlers({ ipcMain, dialog });

  return {
    invoke: (channel, ...args) => {
      const handler = handlers.get(channel);
      assert.ok(handler, `Expected handler for ${channel}`);
      return handler({}, ...args);
    },
    handlers,
  };
};

const withTempGame = async (fn) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-ipc-'));
  try {
    const gamePath = path.join(tempDir, 'Example Story.html');
    fs.writeFileSync(gamePath, '<title>IPC Title</title><tw-storydata name="IPC Story"></tw-storydata>');
    return await fn(gamePath, tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

test('registerIpcHandlers wires expected core channels', () => {
  const { handlers } = createHandlerRegistry();

  [
    'dialog:openFile',
    'path:toFileUrl',
    'file:exists',
    'game:metadata',
    'save:list',
    'save:write',
    'save:read',
    'save:delete',
    'illustrator:get-default-config',
  ].forEach(channel => assert.equal(handlers.has(channel), true, channel));
});

test('dialog:openFile returns selected file or null', async () => {
  assert.equal(await createHandlerRegistry().invoke('dialog:openFile'), null);

  const selected = createHandlerRegistry({
    canceled: false,
    filePaths: ['F:\\Games\\Story.html'],
  });
  assert.equal(await selected.invoke('dialog:openFile'), 'F:\\Games\\Story.html');
});

test('path:toFileUrl normalizes errors into response objects', async () => {
  const { invoke } = createHandlerRegistry();

  const ok = await invoke('path:toFileUrl', 'F:\\Games\\Example Story.html');
  assert.equal(ok.success, true);
  assert.match(ok.url, /^file:\/\//);

  const bad = await invoke('path:toFileUrl', '');
  assert.deepEqual(bad, {
    success: false,
    error: 'File path must be a non-empty string',
  });
});

test('file:exists and game:metadata expose safe file helpers', async () => {
  await withTempGame(async (gamePath, tempDir) => {
    const { invoke } = createHandlerRegistry();

    assert.deepEqual(await invoke('file:exists', gamePath), { success: true, exists: true });
    assert.deepEqual(await invoke('file:exists', path.join(tempDir, 'missing.html')), { success: true, exists: false });

    assert.deepEqual(await invoke('game:metadata', gamePath), {
      success: true,
      title: 'IPC Story',
      source: 'tw-storydata',
    });
  });
});

test('save IPC handlers round-trip bytes and normalize missing files', async () => {
  await withTempGame(async (gamePath) => {
    const { invoke } = createHandlerRegistry();

    assert.deepEqual(await invoke('save:list', gamePath), []);

    const writeResult = await invoke('save:write', gamePath, 'slot-one', [1, 2, 3]);
    assert.equal(writeResult.success, true);
    assert.equal(writeResult.filename, 'slot-one.save');

    const saves = await invoke('save:list', gamePath);
    assert.equal(saves.length, 1);
    assert.equal(saves[0].filename, 'slot-one.save');

    const readResult = await invoke('save:read', gamePath, 'slot-one.save');
    assert.equal(readResult.success, true);
    assert.deepEqual([...readResult.data], [1, 2, 3]);

    assert.deepEqual(await invoke('save:delete', gamePath, 'slot-one.save'), { success: true });
    assert.deepEqual(await invoke('save:read', gamePath, 'slot-one.save'), { success: false, error: 'File not found' });
    assert.deepEqual(await invoke('save:delete', gamePath, 'slot-one.save'), { success: false, error: 'File not found' });
  });
});

test('save:write rejects invalid filenames as response errors', async () => {
  await withTempGame(async (gamePath) => {
    const { invoke } = createHandlerRegistry();
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const result = await invoke('save:write', gamePath, '../bad', [1]);
      assert.equal(result.success, false);
      assert.match(result.error, /plain \.save filename/);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test('illustrator:get-default-config returns renderer-safe defaults', async () => {
  const { invoke } = createHandlerRegistry();
  const result = await invoke('illustrator:get-default-config');

  assert.equal(result.success, true);
  assert.equal(result.config.textBackend, 'ollama');
  assert.equal(result.config.textEndpoint, 'http://localhost:11434');
  assert.equal(result.config.comfyEndpoint, 'http://localhost:8188');
});
