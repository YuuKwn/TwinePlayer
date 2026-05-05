const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getBackupKey,
  readJson,
  safeJsonParse,
  writeJson,
} = require('../src/storage-utils');

const createMemoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));

  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};

test('safeJsonParse returns fallback for invalid JSON', () => {
  const fallback = [];

  assert.equal(safeJsonParse('{bad', fallback), fallback);
  assert.deepEqual(safeJsonParse('{"ok":true}', fallback), { ok: true });
});

test('readJson backs up corrupt values once and returns fallback', () => {
  const storage = createMemoryStorage({
    twine_player_history: '[broken',
  });
  const fallback = [];

  assert.equal(readJson(storage, 'twine_player_history', fallback), fallback);
  assert.equal(storage.getItem(getBackupKey('twine_player_history')), '[broken');

  storage.setItem('twine_player_history', '{still broken');
  assert.equal(readJson(storage, 'twine_player_history', fallback), fallback);
  assert.equal(storage.getItem(getBackupKey('twine_player_history')), '[broken');
});

test('writeJson stores parseable JSON', () => {
  const storage = createMemoryStorage();

  writeJson(storage, 'items', [{ path: 'game.html' }]);

  assert.deepEqual(readJson(storage, 'items', []), [{ path: 'game.html' }]);
});
