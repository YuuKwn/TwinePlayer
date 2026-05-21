const { contextBridge, ipcRenderer } = require('electron');

const assertString = (value, label) => {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new TypeError(`${label} must be a non-empty string`);
    }
};

const assertPlainObject = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object`);
    }
};

contextBridge.exposeInMainWorld('electronAPI', {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    toFileUrl: (filePath) => {
        assertString(filePath, 'File path');
        return ipcRenderer.invoke('path:toFileUrl', filePath);
    },
    fileExists: (filePath) => {
        assertString(filePath, 'File path');
        return ipcRenderer.invoke('file:exists', filePath);
    },
    getGameMetadata: (filePath) => {
        assertString(filePath, 'File path');
        return ipcRenderer.invoke('game:metadata', filePath);
    },
    authorizeGamePath: (gamePath) => {
        assertString(gamePath, 'Game path');
        return ipcRenderer.invoke('game:authorizePath', gamePath);
    },
    listSaves: (gamePath) => {
        assertString(gamePath, 'Game path');
        return ipcRenderer.invoke('save:list', gamePath);
    },
    writeSave: (gamePath, filename, bufferArray) => {
        assertString(gamePath, 'Game path');
        assertString(filename, 'Save filename');
        return ipcRenderer.invoke('save:write', gamePath, filename, bufferArray);
    },
    readSave: (gamePath, filename) => {
        assertString(gamePath, 'Game path');
        assertString(filename, 'Save filename');
        return ipcRenderer.invoke('save:read', gamePath, filename);
    },
    deleteSave: (gamePath, filename) => {
        assertString(gamePath, 'Game path');
        assertString(filename, 'Save filename');
        return ipcRenderer.invoke('save:delete', gamePath, filename);
    }
});

// --- Illustrator Feature ---
// Kept as a separate contextBridge entry so it can be removed independently
// without touching electronAPI or breaking any existing functionality.
contextBridge.exposeInMainWorld('illustratorAPI', {
    getDefaultConfig: () => ipcRenderer.invoke('illustrator:get-default-config'),
    ensureOutputDir: (gamePath) => {
        assertString(gamePath, 'Game path');
        return ipcRenderer.invoke('illustrator:ensure-output-dir', gamePath);
    },
    listTextModels: (config) => ipcRenderer.invoke('illustrator:list-text-models', config),
    listOllamaModels: (config) => ipcRenderer.invoke('illustrator:list-ollama-models', config),
    listComfyUIModels: (config) => ipcRenderer.invoke('illustrator:list-comfyui-models', config),
    checkHealth: (config) => {
        assertPlainObject(config, 'Illustrator config');
        return ipcRenderer.invoke('illustrator:check-health', config);
    },
    generatePrompt: (sceneText, model, config, promptContext = {}) => {
        assertString(sceneText, 'Scene text');
        assertString(model, 'Ollama model');
        assertPlainObject(promptContext, 'Prompt context');
        return ipcRenderer.invoke('illustrator:generate-prompt', sceneText, model, config, promptContext);
    },
    startGeneration: (params) => {
        assertPlainObject(params, 'Illustrator generation params');
        return ipcRenderer.invoke('illustrator:start-generation', params);
    },
    getJob: (jobId) => {
        assertString(jobId, 'Illustrator job id');
        return ipcRenderer.invoke('illustrator:get-job', jobId);
    },
    listJobs: (params = {}) => {
        assertPlainObject(params, 'Illustrator job list params');
        return ipcRenderer.invoke('illustrator:list-jobs', params);
    },
    cancelJob: (jobId) => {
        assertString(jobId, 'Illustrator job id');
        return ipcRenderer.invoke('illustrator:cancel-job', jobId);
    },
    retryJob: (jobId) => {
        assertString(jobId, 'Illustrator job id');
        return ipcRenderer.invoke('illustrator:retry-job', jobId);
    },
    queueComfyUI: (params) => {
        assertPlainObject(params, 'ComfyUI queue params');
        return ipcRenderer.invoke('illustrator:queue-comfyui', params);
    },
    pollImage: (params) => {
        assertPlainObject(params, 'ComfyUI poll params');
        return ipcRenderer.invoke('illustrator:poll-image', params);
    },
});
// --- End Illustrator Feature ---
