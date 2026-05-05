const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  cleanupStaleTempSaves,
  deleteSave,
  fileExists,
  getSavesDir,
  listSaves,
  readSave,
  writeSave,
} = require('../src/main/save-service');

const withTempGame = async (fn) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-'));
  try {
    const gamePath = path.join(tempDir, 'Example Story.html');
    fs.writeFileSync(gamePath, '<html></html>');
    return await fn(gamePath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

test('writeSave creates the sidecar saves directory and writes bytes', async () => {
  await withTempGame(async (gamePath) => {
    const result = await writeSave(gamePath, 'slot-1', [1, 2, 3]);
    const savesDir = getSavesDir(gamePath);

    assert.equal(result.filename, 'slot-1.save');
    assert.equal(result.path, path.join(savesDir, 'slot-1.save'));
    assert.deepEqual([...fs.readFileSync(result.path)], [1, 2, 3]);
  });
});

test('listSaves returns .save files newest first', async () => {
  await withTempGame(async (gamePath) => {
    const older = await writeSave(gamePath, 'older', [1]);
    const newer = await writeSave(gamePath, 'newer', [2]);
    fs.utimesSync(older.path, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'));
    fs.utimesSync(newer.path, new Date('2024-01-02T00:00:00Z'), new Date('2024-01-02T00:00:00Z'));

    const saves = await listSaves(gamePath);
    assert.equal(saves.length, 2);
    assert.equal(saves[0].filename, 'newer.save');
    assert.equal(saves[1].filename, 'older.save');
  });
});

test('readSave returns null for missing saves', async () => {
  await withTempGame(async (gamePath) => {
    assert.equal(await readSave(gamePath, 'missing.save'), null);
  });
});

test('readSave and deleteSave operate through validated filenames', async () => {
  await withTempGame(async (gamePath) => {
    await writeSave(gamePath, 'slot-1', [9, 8, 7]);

    const readResult = await readSave(gamePath, 'slot-1.save');
    assert.equal(readResult.filename, 'slot-1.save');
    assert.deepEqual([...readResult.data], [9, 8, 7]);

    assert.equal(await deleteSave(gamePath, 'slot-1.save'), true);
    assert.equal(await deleteSave(gamePath, 'slot-1.save'), false);
  });
});

test('writeSave uses a temp file and cleans stale temp saves', async () => {
  await withTempGame(async (gamePath) => {
    const savesDir = getSavesDir(gamePath);
    fs.mkdirSync(savesDir, { recursive: true });
    const staleTempPath = path.join(savesDir, '.slot-1.save.tmp-stale');
    fs.writeFileSync(staleTempPath, 'stale partial data');
    fs.utimesSync(staleTempPath, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'));

    const result = await writeSave(gamePath, 'slot-1', [4, 5, 6]);
    const remainingTemps = fs.readdirSync(savesDir).filter(file => file.includes('.tmp-'));

    assert.deepEqual([...fs.readFileSync(result.path)], [4, 5, 6]);
    assert.deepEqual(remainingTemps, []);
  });
});

test('cleanupStaleTempSaves keeps recent temp files', async () => {
  await withTempGame(async (gamePath) => {
    const savesDir = getSavesDir(gamePath);
    fs.mkdirSync(savesDir, { recursive: true });
    const recentTempPath = path.join(savesDir, '.slot-1.save.tmp-recent');
    fs.writeFileSync(recentTempPath, 'recent partial data');

    await cleanupStaleTempSaves(savesDir);

    assert.equal(fs.existsSync(recentTempPath), true);
  });
});

test('fileExists returns true only for readable files', async () => {
  await withTempGame(async (gamePath) => {
    assert.equal(await fileExists(gamePath), true);
    assert.equal(await fileExists(path.join(path.dirname(gamePath), 'missing.html')), false);
    assert.equal(await fileExists(path.dirname(gamePath)), false);
  });
});
