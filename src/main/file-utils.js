const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

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

const normalizeSaveFilename = (filename) => {
  assertNonEmptyString(filename, 'Save filename');

  const trimmed = filename.trim();
  const withExtension = trimmed.toLowerCase().endsWith('.save') ? trimmed : `${trimmed}.save`;

  if (
    path.basename(withExtension) !== withExtension ||
    path.isAbsolute(withExtension) ||
    withExtension.includes('/') ||
    withExtension.includes('\\') ||
    withExtension.includes('\0') ||
    RESERVED_WINDOWS_NAMES.test(withExtension)
  ) {
    throw new Error('Save filename must be a plain .save filename');
  }

  if (!withExtension.toLowerCase().endsWith('.save')) {
    throw new Error('Save filename must end with .save');
  }

  return withExtension;
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

const coerceByteBuffer = (value) => {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return Buffer.from(value);
  if (value && typeof value === 'object') return Buffer.from(Object.values(value));
  throw new Error('Save data must be a byte array');
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
