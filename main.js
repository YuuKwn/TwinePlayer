const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {
  coerceByteBuffer,
  getGameSidecarDir,
  normalizeImageFilename,
  resolveChildPath,
  resolveSavePath,
  toFileUrl,
} = require('./src/main/file-utils');

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
  return getGameSidecarDir(gamePath, 'saves');
};

const ensureSavesDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Twine Games', extensions: ['html', 'htm'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('path:toFileUrl', async (event, filePath) => {
  try {
    return { success: true, url: toFileUrl(filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save:list', async (event, gamePath) => {
  try {
    const dir = getSavesDir(gamePath);
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.save'));
    return files.map(file => {
      const stats = fs.statSync(path.join(dir, file));
      return {
        filename: file,
        size: stats.size,
        mtime: stats.mtime
      };
    }).sort((a, b) => b.mtime - a.mtime);
  } catch (err) {
    console.error("Error listing saves", err);
    return [];
  }
});

ipcMain.handle('save:write', async (event, gamePath, filename, bufferArray) => {
  try {
    const { savesDir, filename: safeFilename, fullPath } = resolveSavePath(gamePath, filename);
    ensureSavesDir(savesDir);
    // Electron IPC can serialise Uint8Array as a plain object, so coerce it
    // back to bytes before writing.
    fs.writeFileSync(fullPath, coerceByteBuffer(bufferArray));
    return { success: true, path: fullPath, filename: safeFilename };
  } catch (err) {
    console.error("Error writing save", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save:read', async (event, gamePath, filename) => {
  try {
    const { filename: safeFilename, fullPath } = resolveSavePath(gamePath, filename);
    if (fs.existsSync(fullPath)) {
      return { success: true, data: fs.readFileSync(fullPath), filename: safeFilename };
    }
    return { success: false, error: 'File not found' };
  } catch (err) {
    console.error("Error reading save", err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save:delete', async (event, gamePath, filename) => {
  try {
    const { fullPath } = resolveSavePath(gamePath, filename);
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

// ─── Illustrator Feature IPC Handlers ────────────────────────────────────────

ipcMain.handle('illustrator:ensure-output-dir', async (event, gamePath) => {
  try {
    const outputDir = getGameSidecarDir(gamePath, 'illustrations');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    return { success: true, path: outputDir, dir: outputDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('illustrator:list-ollama-models', async () => {
  try {
    const http = require('node:http');
    return await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:11434/api/tags', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, models: (json.models || []).map(m => m.name).filter(Boolean) });
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  } catch (err) {
    console.error('Ollama model list error:', err.message);
    return { success: false, models: [], error: err.message };
  }
});

ipcMain.handle('illustrator:list-comfyui-models', async () => {
  try {
    const http = require('node:http');
    return await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:8188/object_info/CheckpointLoaderSimple', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const inputs = json.CheckpointLoaderSimple?.input?.required?.ckpt_name;
            if (inputs && Array.isArray(inputs[0])) {
              resolve({ success: true, models: inputs[0] });
            } else {
              resolve({ success: true, models: [] });
            }
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  } catch (err) {
    console.error('ComfyUI model list error:', err.message);
    return { success: false, models: [], error: err.message };
  }
});

ipcMain.handle('illustrator:generate-prompt', async (event, sceneText, model) => {
  try {
    const http = require('node:http');
    const body = JSON.stringify({
      model: model,
      prompt: `You are a visual art director. Given the following scene from a text adventure game, write a concise image generation prompt (under 100 words) describing the visual scene. Focus on: setting, lighting, mood, colors, and any key characters or objects. Do not include any explanation — only the prompt text.\n\nScene:\n${sceneText}`,
      stream: false
    });

    return await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, prompt: json.response || '' });
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error('Ollama generate error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('illustrator:queue-comfyui', async (event, { imagePrompt, outputFilename, checkpoint }) => {
  try {
    const http = require('node:http');

    const workflow = {
      "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": checkpoint } },
      "2": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["1", 1], "text": imagePrompt } },
      "3": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["1", 1], "text": "blurry, low quality, watermark, text, ugly" } },
      "4": { "class_type": "EmptyLatentImage", "inputs": { "batch_size": 1, "height": 1216, "width": 832 } },
      "5": { "class_type": "KSampler", "inputs": { "cfg": 7, "denoise": 1, "latent_image": ["4", 0], "model": ["1", 0], "negative": ["3", 0], "positive": ["2", 0], "sampler_name": "euler", "scheduler": "normal", "seed": Math.floor(Math.random() * 1e9), "steps": 20 } },
      "6": { "class_type": "VAEDecode", "inputs": { "samples": ["5", 0], "vae": ["1", 2] } },
      "7": { "class_type": "SaveImage", "inputs": { "filename_prefix": outputFilename.replace('.png', ''), "images": ["6", 0] } }
    };

    const body = JSON.stringify({ prompt: workflow });

    return await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 8188,
        path: '/prompt',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({ success: true, promptId: json.prompt_id });
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error('ComfyUI queue error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('illustrator:poll-image', async (event, { promptId, outputDir }) => {
  try {
    const http = require('node:http');

    const historyData = await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:8188/history/${promptId}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });

    const entry = historyData[promptId];
    if (!entry) return { success: false, pending: true };

    const outputs = entry.outputs;
    for (const nodeId in outputs) {
      const images = outputs[nodeId].images;
      if (images && images.length > 0) {
        const img = images[0];
        const imageUrl = `http://localhost:8188/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;

        // Download and save to local output dir
        try {
          const imageBuffer = await new Promise((resolve, reject) => {
            http.get(imageUrl, (res) => {
              const chunks = [];
              res.on('data', chunk => chunks.push(chunk));
              res.on('end', () => resolve(Buffer.concat(chunks)));
              res.on('error', reject);
            }).on('error', reject);
          });

          const imageFilename = normalizeImageFilename(img.filename);
          const localPath = outputDir ? resolveChildPath(outputDir, imageFilename) : null;
          try {
            if (localPath) {
              fs.writeFileSync(localPath, Buffer.from(imageBuffer));
            }
          } catch (saveErr) {
            console.warn('Illustrator: could not save local copy', saveErr.message);
          }

          // Convert to base64 data URL for display in renderer
          const base64 = imageBuffer.toString('base64');
          return { success: true, dataUrl: `data:image/png;base64,${base64}`, filename: imageFilename, localPath };
        } catch (downloadErr) {
          console.error('Illustrator: image download error', downloadErr.message);
          return { success: false, error: downloadErr.message };
        }
      }
    }

    return { success: false, pending: true };
  } catch (err) {
    console.error('Illustrator poll error:', err.message);
    return { success: false, error: err.message };
  }
});

// ─── End IPC Handlers ────────────────────────────────────────────────────────
