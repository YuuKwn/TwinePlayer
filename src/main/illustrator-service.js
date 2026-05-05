const http = require('node:http');
const fs = require('node:fs');
const {
  getGameSidecarDir,
  normalizeImageFilename,
  resolveChildPath,
} = require('./file-utils');
const { ensureDir } = require('./save-service');
const {
  MAX_IMAGE_PROMPT_LENGTH,
  MAX_MODEL_NAME_LENGTH,
  MAX_SCENE_TEXT_LENGTH,
  assertPlainObject,
  assertPromptId,
  assertString,
  getErrorMessage,
} = require('./validation');

const httpGetText = (url, timeoutMs) => {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
};

const httpGetBuffer = (url, timeoutMs) => {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
};

const httpPostJson = (options, payload, timeoutMs) => {
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = http.request({
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(body);
    req.end();
  });
};

const ensureOutputDir = (gamePath) => {
  const outputDir = getGameSidecarDir(gamePath, 'illustrations');
  ensureDir(outputDir);
  return outputDir;
};

const listOllamaModels = async () => {
  const data = await httpGetText('http://localhost:11434/api/tags', 5000);
  const json = JSON.parse(data);
  return (json.models || []).map(model => model.name).filter(Boolean);
};

const listComfyUIModels = async () => {
  const data = await httpGetText('http://localhost:8188/object_info/CheckpointLoaderSimple', 5000);
  const json = JSON.parse(data);
  const inputs = json.CheckpointLoaderSimple?.input?.required?.ckpt_name;
  return inputs && Array.isArray(inputs[0]) ? inputs[0] : [];
};

const generatePrompt = async (sceneText, model) => {
  const safeSceneText = assertString(sceneText, 'Scene text', MAX_SCENE_TEXT_LENGTH);
  const safeModel = assertString(model, 'Ollama model', MAX_MODEL_NAME_LENGTH);
  const json = await httpPostJson({
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
  }, {
    model: safeModel,
    prompt: `You are a visual art director. Given the following scene from a text adventure game, write a concise image generation prompt (under 100 words) describing the visual scene. Focus on: setting, lighting, mood, colors, and any key characters or objects. Do not include any explanation - only the prompt text.\n\nScene:\n${safeSceneText}`,
    stream: false,
  }, 60000);

  return json.response || '';
};

const queueComfyUI = async (params) => {
  const { imagePrompt, outputFilename, checkpoint } = assertPlainObject(params, 'ComfyUI queue params');
  const safePrompt = assertString(imagePrompt, 'Image prompt', MAX_IMAGE_PROMPT_LENGTH);
  const safeCheckpoint = assertString(checkpoint, 'ComfyUI checkpoint', MAX_MODEL_NAME_LENGTH);
  const outputPrefix = normalizeImageFilename(`${assertString(outputFilename, 'Output filename', 128).replace(/\.png$/i, '')}.png`).replace(/\.png$/i, '');

  const workflow = {
    "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": safeCheckpoint } },
    "2": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["1", 1], "text": safePrompt } },
    "3": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["1", 1], "text": "blurry, low quality, watermark, text, ugly" } },
    "4": { "class_type": "EmptyLatentImage", "inputs": { "batch_size": 1, "height": 1216, "width": 832 } },
    "5": { "class_type": "KSampler", "inputs": { "cfg": 7, "denoise": 1, "latent_image": ["4", 0], "model": ["1", 0], "negative": ["3", 0], "positive": ["2", 0], "sampler_name": "euler", "scheduler": "normal", "seed": Math.floor(Math.random() * 1e9), "steps": 20 } },
    "6": { "class_type": "VAEDecode", "inputs": { "samples": ["5", 0], "vae": ["1", 2] } },
    "7": { "class_type": "SaveImage", "inputs": { "filename_prefix": outputPrefix, "images": ["6", 0] } },
  };

  const json = await httpPostJson({
    hostname: 'localhost',
    port: 8188,
    path: '/prompt',
  }, { prompt: workflow }, 10000);

  return json.prompt_id;
};

const pollImage = async (params) => {
  const { promptId, gamePath } = assertPlainObject(params, 'ComfyUI poll params');
  const safePromptId = assertPromptId(promptId);
  const outputDir = gamePath ? getGameSidecarDir(assertString(gamePath, 'Game path'), 'illustrations') : null;
  const historyData = JSON.parse(await httpGetText(`http://localhost:8188/history/${encodeURIComponent(safePromptId)}`, 5000));
  const entry = historyData[safePromptId];
  if (!entry) return { pending: true };

  const outputs = entry.outputs || {};
  for (const nodeId in outputs) {
    const images = outputs[nodeId].images;
    if (!images || images.length === 0) continue;

    const img = images[0];
    const imageUrl = `http://localhost:8188/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;

    const imageBuffer = await httpGetBuffer(imageUrl, 10000);
    const imageFilename = normalizeImageFilename(img.filename);
    const localPath = outputDir ? resolveChildPath(outputDir, imageFilename) : null;

    if (localPath) {
      try {
        ensureDir(outputDir);
        fs.writeFileSync(localPath, Buffer.from(imageBuffer));
      } catch (err) {
        console.warn('Illustrator: could not save local copy', getErrorMessage(err));
      }
    }

    return {
      dataUrl: `data:image/png;base64,${imageBuffer.toString('base64')}`,
      filename: imageFilename,
      localPath,
    };
  }

  return { pending: true };
};

module.exports = {
  ensureOutputDir,
  generatePrompt,
  listComfyUIModels,
  listOllamaModels,
  pollImage,
  queueComfyUI,
};
