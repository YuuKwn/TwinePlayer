const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertPlainObject,
  assertPromptId,
  assertString,
  getErrorMessage,
} = require('../src/main/validation');

test('assertString trims and enforces maximum length', () => {
  assert.equal(assertString(' value ', 'Value'), 'value');
  assert.throws(() => assertString('', 'Value'), /non-empty string/);
  assert.throws(() => assertString('abcd', 'Value', 3), /too long/);
});

test('assertPlainObject rejects arrays and nullish values', () => {
  assert.deepEqual(assertPlainObject({ ok: true }, 'Params'), { ok: true });
  assert.throws(() => assertPlainObject([], 'Params'), /must be an object/);
  assert.throws(() => assertPlainObject(null, 'Params'), /must be an object/);
});

test('assertPromptId only allows expected ComfyUI id characters', () => {
  assert.equal(assertPromptId('abc_123-xyz'), 'abc_123-xyz');
  assert.throws(() => assertPromptId('../abc'), /unsupported characters/);
  assert.throws(() => assertPromptId('abc?x=1'), /unsupported characters/);
});

test('getErrorMessage normalizes thrown values', () => {
  assert.equal(getErrorMessage(new Error('boom')), 'boom');
  assert.equal(getErrorMessage('plain'), 'plain');
});
