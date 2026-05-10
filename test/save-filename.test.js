const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getSaveFilenameError,
  normalizeSaveFilename,
} = require('../src/shared/save-filename');

test('normalizeSaveFilename appends and preserves .save extension', () => {
  assert.equal(normalizeSaveFilename('slot-one'), 'slot-one.save');
  assert.equal(normalizeSaveFilename('slot-two.save'), 'slot-two.save');
  assert.equal(normalizeSaveFilename('slot-three.SAVE'), 'slot-three.SAVE');
  assert.equal(normalizeSaveFilename(' SLOT '), 'SLOT.save');
});

test('normalizeSaveFilename rejects blank and dot-only names', () => {
  assert.throws(() => normalizeSaveFilename(''), /non-empty string/);
  assert.throws(() => normalizeSaveFilename('   '), /non-empty string/);
  assert.throws(() => normalizeSaveFilename('.'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('..'), /plain \.save filename/);
});

test('normalizeSaveFilename rejects traversal and path-like names', () => {
  assert.throws(() => normalizeSaveFilename('../slot'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('..\\slot'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('folder/slot'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('folder\\slot'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('/tmp/slot.save'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('C:\\tmp\\slot.save'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('C:slot.save'), /plain \.save filename/);
});

test('normalizeSaveFilename rejects Windows reserved names and invalid characters', () => {
  assert.throws(() => normalizeSaveFilename('CON'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('con.save'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('nul'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('LPT9.backup'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('chapter:one'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('slot*one'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('slot\0'), /plain \.save filename/);
});

test('getSaveFilenameError returns renderer-friendly messages', () => {
  assert.equal(getSaveFilenameError('slot'), '');
  assert.equal(getSaveFilenameError('slot.SAVE'), '');
  assert.equal(getSaveFilenameError(''), 'Enter a save name.');
  assert.equal(getSaveFilenameError('../slot'), 'Use a plain save filename.');
  assert.equal(getSaveFilenameError('chapter:one'), 'Use a plain save filename.');
});
