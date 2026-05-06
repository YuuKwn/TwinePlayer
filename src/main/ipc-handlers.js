const {
  toFileUrl,
} = require('./file-utils');
const {
  extractGameMetadata,
} = require('./game-metadata');
const {
  deleteSave,
  fileExists,
  listSaves,
  readSave,
  writeSave,
} = require('./save-service');
const {
  DEFAULT_ILLUSTRATOR_CONFIG,
  ensureOutputDir,
  generatePrompt,
  listComfyUIModels,
  listOllamaModels,
  listTextModels,
  pollImage,
  queueComfyUI,
} = require('./illustrator-service');
const {
  assertString,
  getErrorMessage,
} = require('./validation');

const registerIpcHandlers = ({ ipcMain, dialog }) => {
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Twine Games', extensions: ['html', 'htm'] }],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('path:toFileUrl', async (event, filePath) => {
    try {
      return { success: true, url: toFileUrl(assertString(filePath, 'File path')) };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('file:exists', async (event, filePath) => {
    try {
      return { success: true, exists: await fileExists(assertString(filePath, 'File path')) };
    } catch (err) {
      return { success: false, exists: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('game:metadata', async (event, filePath) => {
    try {
      return { success: true, ...(await extractGameMetadata(assertString(filePath, 'File path'))) };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('save:list', async (event, gamePath) => {
    try {
      return await listSaves(gamePath);
    } catch (err) {
      console.error('Error listing saves', err);
      return [];
    }
  });

  ipcMain.handle('save:write', async (event, gamePath, filename, bufferArray) => {
    try {
      const result = await writeSave(gamePath, filename, bufferArray);
      return { success: true, ...result };
    } catch (err) {
      console.error('Error writing save', err);
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('save:read', async (event, gamePath, filename) => {
    try {
      const result = await readSave(gamePath, filename);
      if (result) {
        return { success: true, ...result };
      }
      return { success: false, error: 'File not found' };
    } catch (err) {
      console.error('Error reading save', err);
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('save:delete', async (event, gamePath, filename) => {
    try {
      if (await deleteSave(gamePath, filename)) {
        return { success: true };
      }
      return { success: false, error: 'File not found' };
    } catch (err) {
      console.error('Error deleting save', err);
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:get-default-config', async () => {
    return { success: true, config: DEFAULT_ILLUSTRATOR_CONFIG };
  });

  ipcMain.handle('illustrator:ensure-output-dir', async (event, gamePath) => {
    try {
      const outputDir = await ensureOutputDir(gamePath);
      return { success: true, path: outputDir, dir: outputDir };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:list-text-models', async (event, config) => {
    try {
      return { success: true, models: await listTextModels(config) };
    } catch (err) {
      console.error('Text model list error:', getErrorMessage(err));
      return { success: false, models: [], error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:list-ollama-models', async (event, config) => {
    try {
      return { success: true, models: await listOllamaModels(config) };
    } catch (err) {
      console.error('Text model list error:', getErrorMessage(err));
      return { success: false, models: [], error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:list-comfyui-models', async (event, config) => {
    try {
      return { success: true, models: await listComfyUIModels(config) };
    } catch (err) {
      console.error('ComfyUI model list error:', getErrorMessage(err));
      return { success: false, models: [], error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:generate-prompt', async (event, sceneText, model, config) => {
    try {
      return { success: true, prompt: await generatePrompt(sceneText, model, config) };
    } catch (err) {
      console.error('Text prompt generate error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:queue-comfyui', async (event, params) => {
    try {
      return { success: true, promptId: await queueComfyUI(params) };
    } catch (err) {
      console.error('ComfyUI queue error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:poll-image', async (event, params) => {
    try {
      const result = await pollImage(params);
      if (result.pending) {
        return { success: false, pending: true };
      }
      return { success: true, ...result };
    } catch (err) {
      console.error('Illustrator poll error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });
};

module.exports = {
  registerIpcHandlers,
};
