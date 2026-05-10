const assert = require('node:assert/strict');
const test = require('node:test');

const {
  addConsoleCommandForGame,
  filterAutocompleteProperties,
  formatBytes,
  getAutocompleteParts,
  getConsoleCommandsForGame,
  getSaveDisplayName,
  hashString,
  normalizeConsoleCommandStore,
  removeConsoleCommandForGame,
} = require('../src/shared/game-player-helpers');

test('formatBytes formats save metadata sizes', () => {
  assert.equal(formatBytes(0), '0 Bytes');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1536), '1.5 KB');
});

test('getSaveDisplayName removes the save extension case-insensitively', () => {
  assert.equal(getSaveDisplayName('slot-one.save'), 'slot-one');
  assert.equal(getSaveDisplayName('slot-two.SAVE'), 'slot-two');
});

test('hashString is stable for console fallback identities', () => {
  assert.equal(hashString('example'), hashString('example'));
  assert.notEqual(hashString('example'), hashString('different'));
});

test('getAutocompleteParts parses property chains', () => {
  assert.deepEqual(getAutocompleteParts('State.va'), {
    baseExpression: 'State',
    pathStr: 'State.',
    prefix: 'va',
  });
  assert.deepEqual(getAutocompleteParts('State.variables.'), {
    baseExpression: 'State.variables',
    pathStr: 'State.variables.',
    prefix: '',
  });
  assert.equal(getAutocompleteParts(''), null);
});

test('filterAutocompleteProperties dedupes, sorts, and limits completions', () => {
  assert.deepEqual(
    filterAutocompleteProperties(['beta', 'alpha', 'alpha', 'atom'], 'a', 'State.'),
    [
      { propName: 'alpha', fullPath: 'State.alpha', prefix: 'a' },
      { propName: 'atom', fullPath: 'State.atom', prefix: 'a' },
    ]
  );
});

test('normalizeConsoleCommandStore drops malformed saved console history', () => {
  assert.deepEqual(normalizeConsoleCommandStore(null), {});
  assert.deepEqual(normalizeConsoleCommandStore([]), {});
  assert.deepEqual(
    normalizeConsoleCommandStore({
      IFID: ['State.variables.gold', '', 12, 'Engine.show()'],
      BROKEN: 'not-an-array',
      '': ['ignored'],
    }),
    {
      IFID: ['State.variables.gold', 'Engine.show()'],
    }
  );
});

test('getConsoleCommandsForGame returns a safe list for one game', () => {
  assert.deepEqual(getConsoleCommandsForGame({ IFID: ['one'], OTHER: ['two'] }, 'IFID'), ['one']);
  assert.deepEqual(getConsoleCommandsForGame({ IFID: 'broken' }, 'IFID'), []);
  assert.deepEqual(getConsoleCommandsForGame({ IFID: ['one'] }, ''), []);
});

test('addConsoleCommandForGame trims commands and avoids duplicates', () => {
  assert.deepEqual(
    addConsoleCommandForGame({ IFID: ['one'] }, 'IFID', ' two '),
    { saved: { IFID: ['one', 'two'] }, added: true }
  );
  assert.deepEqual(
    addConsoleCommandForGame({ IFID: ['one'] }, 'IFID', 'one'),
    { saved: { IFID: ['one'] }, added: false }
  );
  assert.deepEqual(
    addConsoleCommandForGame({ IFID: ['one'] }, 'IFID', ' '),
    { saved: { IFID: ['one'] }, added: false }
  );
});

test('removeConsoleCommandForGame removes by index and deletes empty game lists', () => {
  assert.deepEqual(
    removeConsoleCommandForGame({ IFID: ['one', 'two'] }, 'IFID', 0),
    { saved: { IFID: ['two'] }, removed: true }
  );
  assert.deepEqual(
    removeConsoleCommandForGame({ IFID: ['one'] }, 'IFID', 0),
    { saved: {}, removed: true }
  );
  assert.deepEqual(
    removeConsoleCommandForGame({ IFID: ['one'] }, 'IFID', 3),
    { saved: { IFID: ['one'] }, removed: false }
  );
});
