const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const os = require('node:os');
const path = require('node:path');
const { registerIpcHandlers } = require('./src/main/ipc-handlers');

if (process.env.TWINEPLAYER_E2E_SMOKE === '1') {
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.setPath('userData', path.join(os.tmpdir(), `twine-player-e2e-${process.pid}`));
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
