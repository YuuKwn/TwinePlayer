const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getTitleFromPath,
  normalizeLibraryHistory,
} = require('../src/shared/library-history');
const {
  readJson,
  writeJson,
} = require('../src/storage-utils');

const createMemoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));

  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  };
};

test('getTitleFromPath formats game filenames', () => {
  assert.equal(getTitleFromPath('F:\\Games\\space-adventure.html'), 'Space Adventure');
  assert.equal(getTitleFromPath('/games/quiet_room.htm'), 'Quiet Room');
  assert.equal(getTitleFromPath(''), 'Unknown Game');
});

test('normalizeLibraryHistory removes malformed entries and fills missing fields', () => {
  const now = new Date('2026-05-09T12:00:00.000Z');
  const result = normalizeLibraryHistory([
    null,
    { path: '' },
    { path: 'F:\\Games\\first-game.html', title: '', lastPlayed: 'not-a-date' },
  ], now);

  assert.equal(result.changed, true);
  assert.deepEqual(result.history, [{
    path: 'F:\\Games\\first-game.html',
    title: 'First Game',
    lastPlayed: '2026-05-09T12:00:00.000Z',
  }]);
});

test('normalizeLibraryHistory dedupes by path and keeps most recent play time', () => {
  const result = normalizeLibraryHistory([
    { path: 'F:\\Games\\story.html', title: 'Old', lastPlayed: '2026-01-01T00:00:00.000Z' },
    { path: 'F:\\Games\\story.html', title: 'New', lastPlayed: '2026-02-01T00:00:00.000Z' },
  ]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.history, [{
    path: 'F:\\Games\\story.html',
    title: 'New',
    lastPlayed: '2026-02-01T00:00:00.000Z',
  }]);
});

test('normalizeLibraryHistory preserves valid entries', () => {
  const entry = {
    path: 'F:\\Games\\story.html',
    title: 'Story',
    lastPlayed: '2026-02-01T00:00:00.000Z',
  };
  const result = normalizeLibraryHistory([entry]);

  assert.equal(result.changed, false);
  assert.deepEqual(result.history, [entry]);
});

test('normalizeLibraryHistory marks dropped fields as changed', () => {
  const result = normalizeLibraryHistory([{
    path: 'F:\\Games\\story.html',
    title: 'Story',
    lastPlayed: '2026-02-01T00:00:00.000Z',
    extra: 'remove me',
  }]);

  assert.equal(result.changed, true);
  assert.deepEqual(result.history, [{
    path: 'F:\\Games\\story.html',
    title: 'Story',
    lastPlayed: '2026-02-01T00:00:00.000Z',
  }]);
});

test('normalized library history is persisted only when changed', () => {
  const storage = createMemoryStorage({
    twine_player_history: JSON.stringify([
      {
        path: 'F:\\Games\\story.html',
        title: 'Story',
        lastPlayed: '2026-02-01T00:00:00.000Z',
        extra: 'remove me',
      },
    ]),
  });

  const normalized = normalizeLibraryHistory(readJson(storage, 'twine_player_history', []));
  if (normalized.changed) {
    writeJson(storage, 'twine_player_history', normalized.history);
  }

  assert.deepEqual(JSON.parse(storage.getItem('twine_player_history')), [{
    path: 'F:\\Games\\story.html',
    title: 'Story',
    lastPlayed: '2026-02-01T00:00:00.000Z',
  }]);

  const rawAfterFirstPass = storage.getItem('twine_player_history');
  const unchanged = normalizeLibraryHistory(readJson(storage, 'twine_player_history', []));
  if (unchanged.changed) {
    writeJson(storage, 'twine_player_history', unchanged.history);
  }

  assert.equal(unchanged.changed, false);
  assert.equal(storage.getItem('twine_player_history'), rawAfterFirstPass);
});
