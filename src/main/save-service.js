const fs = require('node:fs');
const path = require('node:path');
const {
  coerceByteBuffer,
  getGameSidecarDir,
  resolveSavePath,
} = require('./file-utils');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const getSavesDir = (gamePath) => {
  return getGameSidecarDir(gamePath, 'saves');
};

const listSaves = (gamePath) => {
  const dir = getSavesDir(gamePath);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(file => file.toLowerCase().endsWith('.save'));
  return files.map(file => {
    const stats = fs.statSync(path.join(dir, file));
    return {
      filename: file,
      size: stats.size,
      mtime: stats.mtime,
    };
  }).sort((a, b) => b.mtime - a.mtime);
};

const writeSave = (gamePath, filename, bufferArray) => {
  const { savesDir, filename: safeFilename, fullPath } = resolveSavePath(gamePath, filename);
  ensureDir(savesDir);
  fs.writeFileSync(fullPath, coerceByteBuffer(bufferArray));
  return { path: fullPath, filename: safeFilename };
};

const readSave = (gamePath, filename) => {
  const { filename: safeFilename, fullPath } = resolveSavePath(gamePath, filename);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  return { data: fs.readFileSync(fullPath), filename: safeFilename };
};

const deleteSave = (gamePath, filename) => {
  const { fullPath } = resolveSavePath(gamePath, filename);
  if (!fs.existsSync(fullPath)) {
    return false;
  }

  fs.unlinkSync(fullPath);
  return true;
};

module.exports = {
  deleteSave,
  ensureDir,
  getSavesDir,
  listSaves,
  readSave,
  writeSave,
};
