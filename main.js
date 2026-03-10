const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

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
    backgroundColor: '#0f172a'
  });

  mainWindow.loadFile('index.html');
};

const getSavesDir = (gamePath) => {
  const parsed = path.parse(gamePath);
  return path.join(parsed.dir, `${parsed.name}_saves`);
};

const ensureSavesDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

app.whenReady().then(() => {
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'HTML Files', extensions: ['html', 'htm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

  // --- Saves IPC Handlers ---
  ipcMain.handle('save:list', async (event, gamePath) => {
    try {
      const dir = getSavesDir(gamePath);
      if (!fs.existsSync(dir)) return [];

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.save'));
      return files.map(file => {
        const stats = fs.statSync(path.join(dir, file));
        return {
          filename: file,
          size: stats.size,
          mtime: stats.mtime
        };
      }).sort((a, b) => b.mtime - a.mtime); // Newest first
    } catch (err) {
      console.error("Error listing saves", err);
      return [];
    }
  });

  ipcMain.handle('save:write', async (event, gamePath, filename, bufferArray) => {
    try {
      const dir = getSavesDir(gamePath);
      ensureSavesDir(dir);
      const fullPath = path.join(dir, filename.endsWith('.save') ? filename : filename + '.save');
      fs.writeFileSync(fullPath, Buffer.from(bufferArray));
      return { success: true, path: fullPath };
    } catch (err) {
      console.error("Error writing save", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save:read', async (event, gamePath, filename) => {
    try {
      const dir = getSavesDir(gamePath);
      const fullPath = path.join(dir, filename);
      if (fs.existsSync(fullPath)) {
        return { success: true, data: fs.readFileSync(fullPath), filename: filename };
      }
      return { success: false, error: 'File not found' };
    } catch (err) {
      console.error("Error reading save", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save:delete', async (event, gamePath, filename) => {
    try {
      const dir = getSavesDir(gamePath);
      const fullPath = path.join(dir, filename);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return { success: true };
      }
      return { success: false, error: 'File not found' };
    } catch (err) {
      console.error("Error deleting save", err);
      return { success: false, error: err.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
