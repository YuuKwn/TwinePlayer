const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  registerIpcHandlers,
} = require('../src/main/ipc-handlers');
const {
  clearIllustratorJobsForTest,
} = require('../src/main/illustrator-service');

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

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const withServer = async (handler, fn) => {
  const server = http.createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

const jsonResponse = (res, body, statusCode = 200) => {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

test.afterEach(() => {
  clearIllustratorJobsForTest();
});

test('registerIpcHandlers wires expected core channels', () => {
  const { handlers } = createHandlerRegistry();

  [
    'dialog:openFile',
    'path:toFileUrl',
    'file:exists',
    'game:metadata',
    'game:authorizePath',
    'save:list',
    'save:write',
    'save:read',
    'save:delete',
    'illustrator:get-default-config',
    'illustrator:check-health',
    'illustrator:start-generation',
    'illustrator:get-job',
    'illustrator:list-jobs',
    'illustrator:cancel-job',
    'illustrator:retry-job',
  ].forEach(channel => assert.equal(handlers.has(channel), true, channel));
});

test('dialog:openFile returns selected file or null', async () => {
  assert.equal(await createHandlerRegistry().invoke('dialog:openFile'), null);

  await withTempGame(async (gamePath) => {
    const selected = createHandlerRegistry({
      canceled: false,
      filePaths: [gamePath],
    });
    assert.equal(await selected.invoke('dialog:openFile'), path.resolve(gamePath));
  });
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
    assert.deepEqual(await invoke('game:authorizePath', gamePath), {
      success: true,
      path: path.resolve(gamePath),
    });

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
    await invoke('game:authorizePath', gamePath);
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

test('game:authorizePath rejects non-HTML paths and directories', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-ipc-'));
  try {
    const textPath = path.join(tempDir, 'notes.txt');
    const dirPath = path.join(tempDir, 'folder.html');
    fs.writeFileSync(textPath, 'not a game');
    fs.mkdirSync(dirPath);

    const { invoke } = createHandlerRegistry();

    assert.deepEqual(await invoke('game:authorizePath', textPath), {
      success: false,
      error: 'Game path must point to an .html or .htm file',
    });
    assert.deepEqual(await invoke('game:authorizePath', dirPath), {
      success: false,
      error: 'Game path must point to a readable file',
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('save IPC handlers reject unknown game paths', async () => {
  await withTempGame(async (gamePath, tempDir) => {
    const { invoke } = createHandlerRegistry();
    const unknownPath = path.join(tempDir, 'Unknown.html');
    fs.writeFileSync(unknownPath, '<title>Unknown</title>');

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const listUnknown = await invoke('save:list', unknownPath);
      assert.equal(listUnknown.success, false);
      assert.match(listUnknown.error, /not authorized/);

      const writeUnknown = await invoke('save:write', unknownPath, 'slot', [1]);
      assert.equal(writeUnknown.success, false);
      assert.match(writeUnknown.error, /not authorized/);

      const readUnknown = await invoke('save:read', unknownPath, 'slot.save');
      assert.equal(readUnknown.success, false);
      assert.match(readUnknown.error, /not authorized/);

      const deleteUnknown = await invoke('save:delete', unknownPath, 'slot.save');
      assert.equal(deleteUnknown.success, false);
      assert.match(deleteUnknown.error, /not authorized/);

      const listUnselected = await invoke('save:list', gamePath);
      assert.equal(listUnselected.success, false);
      assert.match(listUnselected.error, /not authorized/);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test('authorized save paths must remain readable HTML files', async () => {
  await withTempGame(async (gamePath) => {
    const { invoke } = createHandlerRegistry();
    await invoke('game:authorizePath', gamePath);
    fs.unlinkSync(gamePath);

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const listResult = await invoke('save:list', gamePath);
      assert.equal(listResult.success, false);
      assert.match(listResult.error, /no such file|ENOENT/i);
      const writeResult = await invoke('save:write', gamePath, 'slot', [1]);
      assert.equal(writeResult.success, false);
      assert.match(writeResult.error, /no such file|ENOENT/i);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test('dialog:openFile rejects non-HTML selections returned by the dialog', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-ipc-'));
  try {
    const textPath = path.join(tempDir, 'notes.txt');
    fs.writeFileSync(textPath, 'not a game');
    const selected = createHandlerRegistry({
      canceled: false,
      filePaths: [textPath],
    });

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      assert.equal(await selected.invoke('dialog:openFile'), null);
    } finally {
      console.error = originalConsoleError;
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('illustrator:get-default-config returns renderer-safe defaults', async () => {
  const { invoke } = createHandlerRegistry();
  const result = await invoke('illustrator:get-default-config');

  assert.equal(result.success, true);
  assert.equal(result.config.textBackend, 'ollama');
  assert.equal(result.config.textEndpoint, 'http://localhost:11434');
  assert.equal(result.config.comfyEndpoint, 'http://localhost:8188');
});

test('illustrator output directory requires an authorized game path', async () => {
  await withTempGame(async (gamePath, tempDir) => {
    const { invoke } = createHandlerRegistry();

    const unauthorized = await invoke('illustrator:ensure-output-dir', gamePath);
    assert.equal(unauthorized.success, false);
    assert.match(unauthorized.error, /not authorized/);

    await invoke('game:authorizePath', gamePath);
    const authorized = await invoke('illustrator:ensure-output-dir', gamePath);

    assert.equal(authorized.success, true);
    assert.equal(authorized.path, path.join(tempDir, 'Example Story_illustrations'));
    assert.equal(fs.existsSync(authorized.path), true);
  });
});

test('illustrator output directory authorization revalidates the selected HTML file', async () => {
  await withTempGame(async (gamePath) => {
    const { invoke } = createHandlerRegistry();
    await invoke('game:authorizePath', gamePath);
    fs.unlinkSync(gamePath);

    const result = await invoke('illustrator:ensure-output-dir', gamePath);
    assert.equal(result.success, false);
    assert.match(result.error, /no such file|ENOENT/i);
  });
});

test('illustrator image copy rejects unknown game paths before polling', async () => {
  await withTempGame(async (gamePath, tempDir) => {
    const unknownPath = path.join(tempDir, 'Unknown.html');
    fs.writeFileSync(unknownPath, '<html></html>');
    const { invoke } = createHandlerRegistry();
    await invoke('game:authorizePath', gamePath);

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const result = await invoke('illustrator:poll-image', {
        promptId: 'done',
        gamePath: unknownPath,
        config: { comfyEndpoint: 'http://127.0.0.1:1' },
      });

      assert.equal(result.success, false);
      assert.match(result.error, /not authorized/);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test('authorized illustrator image copy writes inside the game illustration directory', async () => {
  await withTempGame(async (gamePath, tempDir) => {
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    await withServer((req, res) => {
      if (req.url === '/history/done') {
        jsonResponse(res, {
          done: {
            outputs: {
              7: {
                images: [
                  { filename: 'chapter.png', subfolder: '', type: 'output' },
                ],
              },
            },
          },
        });
        return;
      }

      assert.equal(req.url, '/view?filename=chapter.png&subfolder=&type=output');
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(imageBytes);
    }, async (endpoint) => {
      const { invoke } = createHandlerRegistry();
      await invoke('game:authorizePath', gamePath);

      const result = await invoke('illustrator:poll-image', {
        promptId: 'done',
        gamePath,
        config: { comfyEndpoint: endpoint },
      });

      const localPath = path.join(tempDir, 'Example Story_illustrations', 'chapter.png');
      assert.equal(result.success, true);
      assert.equal(result.filename, 'chapter.png');
      assert.equal(result.localPath, localPath);
      assert.deepEqual([...fs.readFileSync(localPath)], [...imageBytes]);
    });
  });
});

test('illustrator job start requires an authorized game path', async () => {
  await withTempGame(async (gamePath, tempDir) => {
    const unknownPath = path.join(tempDir, 'Unknown.html');
    fs.writeFileSync(unknownPath, '<html></html>');
    const { invoke } = createHandlerRegistry();
    await invoke('game:authorizePath', gamePath);

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const result = await invoke('illustrator:start-generation', {
        imagePrompt: 'a quiet garden',
        outputFilename: 'chapter-one.png',
        checkpoint: 'story.safetensors',
        gamePath: unknownPath,
        config: { comfyEndpoint: 'http://127.0.0.1:1' },
      });

      assert.equal(result.success, false);
      assert.match(result.error, /not authorized/);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test('illustrator job IPC starts lists cancels and reads jobs', async () => {
  await withTempGame(async (gamePath) => {
    await withServer((req, res) => {
      assert.equal(req.url, '/prompt');
      jsonResponse(res, { prompt_id: 'ipc-job' });
    }, async (endpoint) => {
      const { invoke } = createHandlerRegistry();
      await invoke('game:authorizePath', gamePath);

      const started = await invoke('illustrator:start-generation', {
        imagePrompt: 'a quiet garden',
        outputFilename: 'chapter-one.png',
        checkpoint: 'story.safetensors',
        gamePath,
        config: { comfyEndpoint: endpoint, seed: 123 },
        metadata: { passageTitle: 'Garden' },
      });
      assert.equal(started.success, true);
      assert.equal(started.job.status, 'polling');
      assert.equal(started.job.promptId, 'ipc-job');

      const listed = await invoke('illustrator:list-jobs', { gamePath });
      assert.equal(listed.success, true);
      assert.equal(listed.jobs.length, 1);
      assert.equal(listed.jobs[0].jobId, started.job.jobId);

      const canceled = await invoke('illustrator:cancel-job', started.job.jobId);
      assert.equal(canceled.success, true);
      assert.equal(canceled.job.status, 'canceled');

      const lookedUp = await invoke('illustrator:get-job', started.job.jobId);
      assert.equal(lookedUp.success, true);
      assert.equal(lookedUp.job.status, 'canceled');
    });
  });
});

test('illustrator model listing and prompt generation do not require a game path', async () => {
  await withServer(async (req, res) => {
    if (req.url === '/api/tags') {
      jsonResponse(res, { models: [{ name: 'llama3.2' }] });
      return;
    }

    assert.equal(req.url, '/api/generate');
    const body = await readJsonBody(req);
    assert.equal(body.model, 'llama3.2');
    assert.match(body.prompt, /A moonlit room/);
    jsonResponse(res, { response: 'moonlit room, blue shadows' });
  }, async (endpoint) => {
    const { invoke } = createHandlerRegistry();
    const config = { textEndpoint: endpoint, textModel: 'llama3.2' };

    assert.deepEqual(await invoke('illustrator:list-text-models', config), {
      success: true,
      models: ['llama3.2'],
    });

    assert.deepEqual(await invoke('illustrator:generate-prompt', 'A moonlit room.', 'llama3.2', config), {
      success: true,
      prompt: 'moonlit room, blue shadows',
    });
  });
});

test('illustrator health check does not require a game path', async () => {
  await withServer((req, res) => {
    if (req.url === '/api/tags') {
      jsonResponse(res, { models: [{ name: 'llama3.2' }] });
      return;
    }

    assert.equal(req.url, '/object_info/CheckpointLoaderSimple');
    jsonResponse(res, {
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [['story.safetensors']],
          },
        },
      },
    });
  }, async (endpoint) => {
    const { invoke } = createHandlerRegistry();
    const result = await invoke('illustrator:check-health', {
      textEndpoint: endpoint,
      textModel: 'llama3.2',
      comfyEndpoint: endpoint,
      checkpoint: 'story.safetensors',
    });

    assert.equal(result.success, true);
    assert.equal(result.health.text.status, 'ok');
    assert.equal(result.health.comfyUI.status, 'ok');
  });
});
