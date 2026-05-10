const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerIpcHandlers } = require('./src/main/ipc-handlers');

const isE2E = process.env.TWINEPLAYER_E2E === '1' || process.env.TWINEPLAYER_E2E_SMOKE === '1';

if (isE2E) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  const userDataPath = path.join(os.tmpdir(), `twine-player-e2e-${process.pid}`);
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
  });

  mainWindow.loadFile('index.html');
  return mainWindow;
};

registerIpcHandlers({ ipcMain, dialog });

app.whenReady().then(() => {
  const mainWindow = createWindow();

  if (process.env.TWINEPLAYER_E2E_SMOKE === '1') {
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('TWINEPLAYER_E2E_READY index.html');
      app.quit();
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
