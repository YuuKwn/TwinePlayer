const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  normalizeSaveFilename,
} = require('../shared/save-filename');

const MAX_SAVE_BYTES = 50 * 1024 * 1024;

const assertNonEmptyString = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
};

const getGameSidecarDir = (gamePath, suffix) => {
  assertNonEmptyString(gamePath, 'Game path');
  assertNonEmptyString(suffix, 'Directory suffix');

  const parsed = path.parse(gamePath);
  if (!parsed.name || !parsed.dir) {
    throw new Error('Game path must include a directory and filename');
  }

  return path.join(parsed.dir, `${parsed.name}_${suffix}`);
};

const resolveSavePath = (gamePath, filename) => {
  const savesDir = getGameSidecarDir(gamePath, 'saves');
  const safeFilename = normalizeSaveFilename(filename);
  const fullPath = path.resolve(savesDir, safeFilename);
  const resolvedDir = path.resolve(savesDir);

  if (path.dirname(fullPath) !== resolvedDir) {
    throw new Error('Save path escaped the saves directory');
  }

  return { savesDir, filename: safeFilename, fullPath };
};

const assertByteValues = (values) => {
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error('Save data must contain only byte values');
    }
  }
};

const coerceByteBuffer = (value) => {
  let buffer;
  if (Buffer.isBuffer(value)) buffer = value;
  else if (value instanceof Uint8Array) buffer = Buffer.from(value);
  else if (Array.isArray(value)) {
    assertByteValues(value);
    buffer = Buffer.from(value);
  } else if (value && typeof value === 'object') {
    const values = Object.values(value);
    assertByteValues(values);
    buffer = Buffer.from(values);
  }
  else throw new Error('Save data must be a byte array');

  if (buffer.length === 0) {
    throw new Error('Save data cannot be empty');
  }

  if (buffer.length > MAX_SAVE_BYTES) {
    throw new Error('Save data exceeds the 50 MB limit');
  }

  return buffer;
};

const normalizeImageFilename = (filename) => {
  assertNonEmptyString(filename, 'Image filename');

  const base = path.basename(filename.trim());
  if (
    base !== filename.trim() ||
    path.isAbsolute(base) ||
    base.includes('/') ||
    base.includes('\\') ||
    base.includes('\0')
  ) {
    throw new Error('Image filename must be a plain filename');
  }

  return base;
};

const resolveChildPath = (parentDir, filename) => {
  assertNonEmptyString(parentDir, 'Parent directory');
  const safeFilename = normalizeImageFilename(filename);
  const fullPath = path.resolve(parentDir, safeFilename);
  const resolvedParent = path.resolve(parentDir);

  if (path.dirname(fullPath) !== resolvedParent) {
    throw new Error('Child path escaped the parent directory');
  }

  return fullPath;
};

const toFileUrl = (filePath) => {
  assertNonEmptyString(filePath, 'File path');
  return pathToFileURL(filePath).toString();
};

module.exports = {
  coerceByteBuffer,
  getGameSidecarDir,
  normalizeImageFilename,
  normalizeSaveFilename,
  resolveChildPath,
  resolveSavePath,
  toFileUrl,
};
