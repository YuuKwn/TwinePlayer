const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getTitleFromPath,
  normalizeLibraryHistory,
} = require('../src/shared/library-history');

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
