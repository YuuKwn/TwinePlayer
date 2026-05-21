const fs = require('node:fs');
const path = require('node:path');
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
  cancelIllustratorJob,
  checkIllustratorHealth,
  deleteIllustration,
  ensureOutputDir,
  generatePrompt,
  getIllustratorJob,
  listComfyUIModels,
  listIllustrations,
  listIllustratorJobs,
  listOllamaModels,
  listTextModels,
  pollImage,
  queueComfyUI,
  readIllustrationImage,
  retryIllustratorJob,
  startIllustratorGeneration,
} = require('./illustrator-service');
const {
  assertPlainObject,
  assertString,
  getErrorMessage,
} = require('./validation');

const HTML_GAME_EXTENSIONS = new Set(['.html', '.htm']);

const normalizeGamePath = (gamePath) => path.resolve(assertString(gamePath, 'Game path'));

const isHtmlGamePath = (gamePath) => HTML_GAME_EXTENSIONS.has(path.extname(gamePath).toLowerCase());

const createGamePathAuthorizer = () => {
  const authorizedGamePaths = new Map();

  const assertReadableHtmlFile = async (gamePath) => {
    const normalizedPath = normalizeGamePath(gamePath);
    if (!isHtmlGamePath(normalizedPath)) {
      throw new Error('Game path must point to an .html or .htm file');
    }

    await fs.promises.access(normalizedPath, fs.constants.R_OK);
    const stats = await fs.promises.stat(normalizedPath);
    if (!stats.isFile()) {
      throw new Error('Game path must point to a readable file');
    }

    return {
      normalizedPath,
      realPath: await fs.promises.realpath(normalizedPath),
    };
  };

  const authorize = async (gamePath) => {
    const { normalizedPath, realPath } = await assertReadableHtmlFile(gamePath);
    authorizedGamePaths.set(normalizedPath, realPath);
    return normalizedPath;
  };

  const requireAuthorized = async (gamePath) => {
    const { normalizedPath, realPath } = await assertReadableHtmlFile(gamePath);
    const authorizedRealPath = authorizedGamePaths.get(normalizedPath);
    if (!authorizedRealPath) {
      throw new Error('Game path is not authorized for save operations');
    }

    if (realPath !== authorizedRealPath) {
      throw new Error('Authorized game path has changed since selection');
    }

    return normalizedPath;
  };

  return {
    authorize,
    requireAuthorized,
  };
};

const registerIpcHandlers = ({ ipcMain, dialog }) => {
  const gamePathAuthorizer = createGamePathAuthorizer();

  ipcMain.handle('dialog:openFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Twine Games', extensions: ['html', 'htm'] }],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return await gamePathAuthorizer.authorize(result.filePaths[0]);
    } catch (err) {
      console.error('Error selecting game file', err);
      return null;
    }
  });

  ipcMain.handle('game:authorizePath', async (event, gamePath) => {
    try {
      return { success: true, path: await gamePathAuthorizer.authorize(gamePath) };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
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
      return await listSaves(await gamePathAuthorizer.requireAuthorized(gamePath));
    } catch (err) {
      console.error('Error listing saves', err);
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('save:write', async (event, gamePath, filename, bufferArray) => {
    try {
      const result = await writeSave(await gamePathAuthorizer.requireAuthorized(gamePath), filename, bufferArray);
      return { success: true, ...result };
    } catch (err) {
      console.error('Error writing save', err);
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('save:read', async (event, gamePath, filename) => {
    try {
      const result = await readSave(await gamePathAuthorizer.requireAuthorized(gamePath), filename);
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
      if (await deleteSave(await gamePathAuthorizer.requireAuthorized(gamePath), filename)) {
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
      const outputDir = await ensureOutputDir(await gamePathAuthorizer.requireAuthorized(gamePath));
      return { success: true, path: outputDir, dir: outputDir };
    } catch (err) {
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:list-gallery', async (event, gamePath, options = {}) => {
    try {
      const safeOptions = options === undefined || options === null
        ? {}
        : assertPlainObject(options, 'Illustrator gallery list options');
      return {
        success: true,
        items: await listIllustrations(
          await gamePathAuthorizer.requireAuthorized(gamePath),
          safeOptions
        ),
      };
    } catch (err) {
      console.error('Illustrator gallery list error:', getErrorMessage(err));
      return { success: false, items: [], error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:read-gallery-image', async (event, gamePath, filename) => {
    try {
      return {
        success: true,
        image: await readIllustrationImage(
          await gamePathAuthorizer.requireAuthorized(gamePath),
          assertString(filename, 'Illustration filename')
        ),
      };
    } catch (err) {
      console.error('Illustrator gallery read error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:delete-gallery-image', async (event, gamePath, filename) => {
    try {
      return {
        success: true,
        result: await deleteIllustration(
          await gamePathAuthorizer.requireAuthorized(gamePath),
          assertString(filename, 'Illustration filename')
        ),
      };
    } catch (err) {
      console.error('Illustrator gallery delete error:', getErrorMessage(err));
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

  ipcMain.handle('illustrator:check-health', async (event, config) => {
    try {
      return { success: true, health: await checkIllustratorHealth(config) };
    } catch (err) {
      console.error('Illustrator health check error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:generate-prompt', async (event, sceneText, model, config, promptContext) => {
    try {
      return { success: true, prompt: await generatePrompt(sceneText, model, config, promptContext) };
    } catch (err) {
      console.error('Text prompt generate error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:start-generation', async (event, params) => {
    try {
      const safeParams = assertPlainObject(params, 'Illustrator generation params');
      const job = await startIllustratorGeneration({
        ...safeParams,
        gamePath: safeParams.gamePath
          ? await gamePathAuthorizer.requireAuthorized(safeParams.gamePath)
          : undefined,
      }, {
        requireAuthorizedGamePath: gamePathAuthorizer.requireAuthorized,
      });
      return { success: true, job };
    } catch (err) {
      console.error('Illustrator generation start error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:get-job', async (event, jobId) => {
    try {
      return { success: true, job: await getIllustratorJob(jobId) };
    } catch (err) {
      console.error('Illustrator job lookup error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:list-jobs', async (event, params = {}) => {
    try {
      const safeParams = params === undefined || params === null
        ? {}
        : assertPlainObject(params, 'Illustrator job list params');
      const gamePath = safeParams.gamePath
        ? await gamePathAuthorizer.requireAuthorized(safeParams.gamePath)
        : undefined;
      return {
        success: true,
        jobs: listIllustratorJobs({
          ...safeParams,
          gamePath,
        }),
      };
    } catch (err) {
      console.error('Illustrator job list error:', getErrorMessage(err));
      return { success: false, jobs: [], error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:cancel-job', async (event, jobId) => {
    try {
      return { success: true, job: cancelIllustratorJob(jobId) };
    } catch (err) {
      console.error('Illustrator job cancel error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:retry-job', async (event, jobId) => {
    try {
      return { success: true, job: await retryIllustratorJob(jobId) };
    } catch (err) {
      console.error('Illustrator job retry error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:queue-comfyui', async (event, params) => {
    try {
      return { success: true, ...(await queueComfyUI(params)) };
    } catch (err) {
      console.error('ComfyUI queue error:', getErrorMessage(err));
      return { success: false, error: getErrorMessage(err) };
    }
  });

  ipcMain.handle('illustrator:poll-image', async (event, params) => {
    try {
      const safeParams = assertPlainObject(params, 'ComfyUI poll params');
      const result = await pollImage({
        ...safeParams,
        gamePath: safeParams.gamePath
          ? await gamePathAuthorizer.requireAuthorized(safeParams.gamePath)
          : undefined,
      });
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
