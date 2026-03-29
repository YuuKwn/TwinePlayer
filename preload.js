const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    listSaves: (gamePath) => ipcRenderer.invoke('save:list', gamePath),
    writeSave: (gamePath, filename, bufferArray) => ipcRenderer.invoke('save:write', gamePath, filename, bufferArray),
    readSave: (gamePath, filename) => ipcRenderer.invoke('save:read', gamePath, filename),
    deleteSave: (gamePath, filename) => ipcRenderer.invoke('save:delete', gamePath, filename)
});

// --- Illustrator Feature ---
// Kept as a separate contextBridge entry so it can be removed independently
// without touching electronAPI or breaking any existing functionality.
contextBridge.exposeInMainWorld('illustratorAPI', {
    ensureOutputDir: (gamePath) => ipcRenderer.invoke('illustrator:ensure-output-dir', gamePath),
    generatePrompt: (params) => ipcRenderer.invoke('illustrator:generate-prompt', params),
    queueComfyUI: (params) => ipcRenderer.invoke('illustrator:queue-comfyui', params),
    pollImage: (params) => ipcRenderer.invoke('illustrator:poll-image', params),
    openFolder: (dirPath) => ipcRenderer.invoke('illustrator:open-folder', dirPath),
});
// --- End Illustrator Feature ---
