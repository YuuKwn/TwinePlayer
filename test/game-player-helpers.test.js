const assert = require('node:assert/strict');
const test = require('node:test');

const {
  filterAutocompleteProperties,
  formatBytes,
  getAutocompleteParts,
  getSaveDisplayName,
  hashString,
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
