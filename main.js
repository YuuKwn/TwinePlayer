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

// --- Illustrator Feature ---

const OLLAMA_URL = 'http://localhost:11434';
const COMFYUI_URL = 'http://127.0.0.1:8188';
const ILLUSTRATOR_DEFAULT_CHECKPOINT = 'waiIllustriousSDXL_v160.safetensors';
const ILLUSTRATOR_OLLAMA_MODEL = 'llama3.2';

const getIllustrationsDir = (gamePath) => {
  const parsed = path.parse(gamePath);
  return path.join(parsed.dir, `${parsed.name}_illustrations`);
};

const buildComfyWorkflow = (prompt, outputDir, outputFilename, checkpoint) => ({
  prompt: {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint }
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: prompt,
        clip: ['1', 1]
      }
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
        clip: ['1', 1]
      }
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 832, height: 1216, batch_size: 1 }
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 999999999),
        steps: 25,
        cfg: 7,
        sampler_name: 'euler_ancestral',
        scheduler: 'normal',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0]
      }
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['5', 0],
        vae: ['1', 2]
      }
    },
    '7': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: outputFilename,
        images: ['6', 0]
      }
    }
  }
});

// --- End Illustrator Feature ---

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
      }).sort((a, b) => b.mtime - a.mtime);
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

  // --- Illustrator IPC Handlers ---

  ipcMain.handle('illustrator:ensure-output-dir', async (event, gamePath) => {
    try {
      const dir = getIllustrationsDir(gamePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return { success: true, dir };
    } catch (err) {
      console.error('Illustrator: error creating output dir', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('illustrator:generate-prompt', async (event, sceneText) => {
    try {
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ILLUSTRATOR_OLLAMA_MODEL,
          stream: false,
          system: 'You are an image prompt generator for Stable Diffusion. Convert game scene descriptions into vivid, concise image generation prompts. Focus only on visual details: setting, lighting, characters, mood, art style. Output only the prompt text itself — no explanations, no labels, no extra text.',
          prompt: sceneText
        })
      });

      if (!response.ok) {
        return { success: false, error: `Ollama returned HTTP ${response.status}. Is it running?` };
      }

      const data = await response.json();
      return { success: true, prompt: data.response.trim() };
    } catch (err) {
      console.error('Illustrator: Ollama error', err);
      return { success: false, error: `Cannot reach Ollama at ${OLLAMA_URL}. Make sure it is running.` };
    }
  });

  ipcMain.handle('illustrator:queue-comfyui', async (event, { imagePrompt, outputFilename, checkpoint }) => {
    try {
      const workflow = buildComfyWorkflow(
        imagePrompt,
        null,
        outputFilename,
        checkpoint || ILLUSTRATOR_DEFAULT_CHECKPOINT
      );

      const response = await fetch(`${COMFYUI_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow)
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `ComfyUI returned HTTP ${response.status}: ${errText}` };
      }

      const data = await response.json();
      if (data.error) {
        return { success: false, error: `ComfyUI workflow error: ${JSON.stringify(data.error)}` };
      }

      return { success: true, promptId: data.prompt_id };
    } catch (err) {
      console.error('Illustrator: ComfyUI queue error', err);
      return { success: false, error: `Cannot reach ComfyUI at ${COMFYUI_URL}. Make sure it is running.` };
    }
  });

  ipcMain.handle('illustrator:poll-image', async (event, { promptId, outputDir }) => {
    try {
      const response = await fetch(`${COMFYUI_URL}/history/${promptId}`);
      if (!response.ok) {
        return { success: false, pending: false, error: `ComfyUI history returned HTTP ${response.status}` };
      }

      const history = await response.json();
      const entry = history[promptId];

      if (!entry) {
        return { success: false, pending: true };
      }

      // Job still running
      if (entry.status && entry.status.status_str !== 'success') {
        if (entry.status.status_str === 'error') {
          const msgs = (entry.status.messages || []).map(m => m[1]).join('; ');
          return { success: false, pending: false, error: `ComfyUI job failed: ${msgs}` };
        }
        return { success: false, pending: true };
      }

      // Find the output image
      const outputs = entry.outputs || {};
      let imageFilename = null;

      for (const nodeId of Object.keys(outputs)) {
        const nodeOut = outputs[nodeId];
        if (nodeOut.images && nodeOut.images.length > 0) {
          imageFilename = nodeOut.images[0].filename;
          break;
        }
      }

      if (!imageFilename) {
        return { success: false, pending: false, error: 'ComfyUI job completed but no output image found.' };
      }

      // ComfyUI saves to its own output folder; read it back from the outputDir we specified
      // The filename_prefix we set means the file should land in ComfyUI's output dir.
      // We fetch it via the ComfyUI /view endpoint to avoid needing the absolute path.
      const imgResponse = await fetch(`${COMFYUI_URL}/view?filename=${encodeURIComponent(imageFilename)}&type=output`);
      if (!imgResponse.ok) {
        return { success: false, pending: false, error: `Could not retrieve image from ComfyUI: HTTP ${imgResponse.status}` };
      }

      const arrayBuffer = await imgResponse.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      // Also save a copy to the game's illustrations folder
      try {
        const localPath = path.join(outputDir, imageFilename);
        fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
      } catch (saveErr) {
        console.warn('Illustrator: could not save local copy', saveErr.message);
        // Non-fatal — we still return the image
      }

      return { success: true, dataUrl, filename: imageFilename };
    } catch (err) {
      console.error('Illustrator: poll error', err);
      return { success: false, pending: false, error: `Poll error: ${err.message}` };
    }
  });

  // --- End Illustrator IPC Handlers ---

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
