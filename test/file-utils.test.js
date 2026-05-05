const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  coerceByteBuffer,
  getGameSidecarDir,
  normalizeSaveFilename,
  resolveChildPath,
  resolveSavePath,
  toFileUrl,
} = require('../src/main/file-utils');

test('getGameSidecarDir creates a game-adjacent directory name', () => {
  const gamePath = 'F:\\Games\\Example Story.html';

  assert.equal(
    getGameSidecarDir(gamePath, 'saves'),
    'F:\\Games\\Example Story_saves'
  );
});

test('normalizeSaveFilename appends .save and preserves valid names', () => {
  assert.equal(normalizeSaveFilename('slot-1'), 'slot-1.save');
  assert.equal(normalizeSaveFilename('slot-2.save'), 'slot-2.save');
});

test('normalizeSaveFilename rejects traversal and absolute paths', () => {
  assert.throws(() => normalizeSaveFilename('../slot.save'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('folder/slot.save'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename('folder\\slot.save'), /plain \.save filename/);
  assert.throws(() => normalizeSaveFilename(path.resolve('slot.save')), /plain \.save filename/);
});

test('resolveSavePath keeps saves inside the game save directory', () => {
  const gamePath = 'F:\\Games\\Example Story.html';
  const result = resolveSavePath(gamePath, 'manual');

  assert.equal(result.filename, 'manual.save');
  assert.equal(result.savesDir, 'F:\\Games\\Example Story_saves');
  assert.equal(result.fullPath, path.resolve(result.savesDir, 'manual.save'));
});

test('resolveChildPath rejects child filename traversal', () => {
  assert.throws(() => resolveChildPath('F:\\Games', '../image.png'), /plain filename/);
});

test('coerceByteBuffer handles common IPC byte shapes', () => {
  assert.deepEqual([...coerceByteBuffer(new Uint8Array([1, 2, 3]))], [1, 2, 3]);
  assert.deepEqual([...coerceByteBuffer([4, 5, 6])], [4, 5, 6]);
  assert.deepEqual([...coerceByteBuffer({ 0: 7, 1: 8, 2: 9 })], [7, 8, 9]);
});

test('toFileUrl returns an encoded file URL', () => {
  const url = toFileUrl('F:\\Games\\Example Story.html');

  assert.match(url, /^file:\/\//);
  assert.match(url, /Example%20Story\.html$/);
});
