const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  deleteSave,
  getSavesDir,
  listSaves,
  readSave,
  writeSave,
} = require('../src/main/save-service');

const withTempGame = (fn) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-'));
  try {
    const gamePath = path.join(tempDir, 'Example Story.html');
    fs.writeFileSync(gamePath, '<html></html>');
    return fn(gamePath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

test('writeSave creates the sidecar saves directory and writes bytes', () => {
  withTempGame((gamePath) => {
    const result = writeSave(gamePath, 'slot-1', [1, 2, 3]);
    const savesDir = getSavesDir(gamePath);

    assert.equal(result.filename, 'slot-1.save');
    assert.equal(result.path, path.join(savesDir, 'slot-1.save'));
    assert.deepEqual([...fs.readFileSync(result.path)], [1, 2, 3]);
  });
});

test('listSaves returns .save files newest first', () => {
  withTempGame((gamePath) => {
    const older = writeSave(gamePath, 'older', [1]);
    const newer = writeSave(gamePath, 'newer', [2]);
    fs.utimesSync(older.path, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'));
    fs.utimesSync(newer.path, new Date('2024-01-02T00:00:00Z'), new Date('2024-01-02T00:00:00Z'));

    const saves = listSaves(gamePath);
    assert.equal(saves.length, 2);
    assert.equal(saves[0].filename, 'newer.save');
    assert.equal(saves[1].filename, 'older.save');
  });
});

test('readSave returns null for missing saves', () => {
  withTempGame((gamePath) => {
    assert.equal(readSave(gamePath, 'missing.save'), null);
  });
});

test('readSave and deleteSave operate through validated filenames', () => {
  withTempGame((gamePath) => {
    writeSave(gamePath, 'slot-1', [9, 8, 7]);

    const readResult = readSave(gamePath, 'slot-1.save');
    assert.equal(readResult.filename, 'slot-1.save');
    assert.deepEqual([...readResult.data], [9, 8, 7]);

    assert.equal(deleteSave(gamePath, 'slot-1.save'), true);
    assert.equal(deleteSave(gamePath, 'slot-1.save'), false);
  });
});
