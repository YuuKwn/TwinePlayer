const fs = require('node:fs');
const path = require('node:path');
const {
  coerceByteBuffer,
  getGameSidecarDir,
  resolveSavePath,
} = require('./file-utils');

const fsp = fs.promises;
const TEMP_SAVE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ensureDir = async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
};

const getSavesDir = (gamePath) => {
  return getGameSidecarDir(gamePath, 'saves');
};

const cleanupStaleTempSaves = async (savesDir, now = Date.now()) => {
  let entries;
  try {
    entries = await fsp.readdir(savesDir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }

  await Promise.all(entries
    .filter(file => file.startsWith('.') && file.includes('.tmp-'))
    .map(async (file) => {
      const tempPath = path.join(savesDir, file);
      try {
        const stats = await fsp.stat(tempPath);
        if (now - stats.mtimeMs >= TEMP_SAVE_MAX_AGE_MS) {
          await fsp.unlink(tempPath);
        }
      } catch (err) {
        if (!err || err.code !== 'ENOENT') throw err;
      }
    }));
};

const listSaves = async (gamePath) => {
  const dir = getSavesDir(gamePath);
  let files;
  try {
    files = await fsp.readdir(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }

  const saves = await Promise.all(files
    .filter(file => file.toLowerCase().endsWith('.save'))
    .map(async (file) => {
      const stats = await fsp.stat(path.join(dir, file));
      return {
        filename: file,
        size: stats.size,
        mtime: stats.mtime,
      };
    }));

  return saves.sort((a, b) => b.mtime - a.mtime);
};

const writeSave = async (gamePath, filename, bufferArray) => {
  const { savesDir, filename: safeFilename, fullPath } = resolveSavePath(gamePath, filename);
  const buffer = coerceByteBuffer(bufferArray);
  await ensureDir(savesDir);
  await cleanupStaleTempSaves(savesDir);

  const tempPath = path.join(
    savesDir,
    `.${safeFilename}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  try {
    await fsp.writeFile(tempPath, buffer);
    await fsp.rename(tempPath, fullPath);
    return {
      path: fullPath,
      filename: safeFilename,
    };
  } catch (err) {
    try {
      await fsp.unlink(tempPath);
    } catch (unlinkErr) {
      if (!unlinkErr || unlinkErr.code !== 'ENOENT') {
        console.warn('Failed to clean up temp save after write failure', unlinkErr);
      }
    }
    throw err;
  }
};

const readSave = async (gamePath, filename) => {
  const { filename: safeFilename, fullPath } = resolveSavePath(gamePath, filename);
  try {
    return { data: await fsp.readFile(fullPath), filename: safeFilename };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
};

const deleteSave = async (gamePath, filename) => {
  const { fullPath } = resolveSavePath(gamePath, filename);
  try {
    await fsp.unlink(fullPath);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
};

const fileExists = async (filePath) => {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
    const stats = await fsp.stat(filePath);
    return stats.isFile();
  } catch (err) {
    return false;
  }
};

module.exports = {
  cleanupStaleTempSaves,
  deleteSave,
  ensureDir,
  fileExists,
  getSavesDir,
  listSaves,
  readSave,
  writeSave,
};
