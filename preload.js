const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    listSaves: (gamePath) => ipcRenderer.invoke('save:list', gamePath),
    writeSave: (gamePath, filename, bufferArray) => ipcRenderer.invoke('save:write', gamePath, filename, bufferArray),
    readSave: (gamePath, filename) => ipcRenderer.invoke('save:read', gamePath, filename),
    deleteSave: (gamePath, filename) => ipcRenderer.invoke('save:delete', gamePath, filename)
});
