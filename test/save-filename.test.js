const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getSaveFilenameError,
  normalizeSaveFilename,
} = require('../src/shared/save-filename');

test('normalizeSaveFilename appends and preserves .save extension', () => {
  assert.equal(normalizeSaveFilename('slot-one'), 'slot-one.save');
  assert.equal(normalizeSaveFilename('slot-two.save'), 'slot-two.save');
  assert.equal(normalizeSaveFilename(' SLOT '), 'SLOT.save');
});

test('normalizeSaveFilename rejects unsafe filenames', () => {
  assert.throws(() => normalizeSaveFilename(''), /non-empty string/);
  assert.throws(() => normalizeSaveFilename('../slot'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('folder/slot'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('folder\\slot'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('nul'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('slot\0'), /plain \.save filename/);
});

test('getSaveFilenameError returns renderer-friendly messages', () => {
  assert.equal(getSaveFilenameError('slot'), '');
  assert.equal(getSaveFilenameError(''), 'Enter a save name.');
  assert.equal(getSaveFilenameError('../slot'), 'Use a plain save filename.');
});
