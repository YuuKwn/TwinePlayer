const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const {
  getGameSidecarDir,
  normalizeImageFilename,
  resolveChildPath,
} = require('./file-utils');
const {
  DEFAULT_ILLUSTRATOR_CONFIG,
  normalizeIllustratorConfig,
} = require('./illustrator-config');
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
const {
  DEFAULT_WORKFLOW_TEMPLATE,
  DEFAULT_WORKFLOW_VERSION,
  createSceneExcerpt,
  normalizeIllustrationMetadata,
} = require('../shared/illustrator-helpers');

const fsp = fs.promises;
const DEFAULT_TIMEOUT_MS = 10000;
const TEXT_TIMEOUT_MS = 60000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hashSceneText = (sceneText) => {
  const text = typeof sceneText === 'string' ? sceneText.trim().slice(0, MAX_SCENE_TEXT_LENGTH) : '';
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
};

const getTransport = (url) => url.protocol === 'https:' ? https : http;

const joinEndpointPath = (endpoint, path) => {
  const url = new URL(endpoint);
  const basePath = url.pathname.replace(/\/+$/, '');
  const childPath = path.startsWith('/') ? path : `/${path}`;
  url.pathname = `${basePath}${childPath}`;
  return url;
};

const readResponseBody = (res, { maxBytes, asBuffer = false }) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    res.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error('Response exceeded size limit'));
        res.destroy();
        return;
      }
      chunks.push(chunk);
    });
    res.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve(asBuffer ? buffer : buffer.toString('utf8'));
    });
    res.on('error', reject);
  });
};

const httpRequest = (method, url, { payload, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_JSON_BYTES, asBuffer = false } = {}) => {
  const body = payload === undefined ? null : JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = getTransport(url).request(url, {
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      } : undefined,
    }, async (res) => {
      try {
        const bodyData = await readResponseBody(res, { maxBytes, asBuffer });
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} from ${url.origin}${url.pathname}`));
          return;
        }

        resolve({
          body: bodyData,
          headers: res.headers,
        });
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timed out'));
    });
    if (body) req.write(body);
    req.end();
  });
};

const httpGetJson = async (url, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const { body } = await httpRequest('GET', url, { timeoutMs });
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error('Service returned invalid JSON');
  }
};

const httpPostJson = async (url, payload, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const { body } = await httpRequest('POST', url, { payload, timeoutMs });
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error('Service returned invalid JSON');
  }
};

const httpGetImage = async (url, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const { body, headers } = await httpRequest('GET', url, {
    timeoutMs,
    maxBytes: MAX_IMAGE_BYTES,
    asBuffer: true,
  });
  const contentType = String(headers['content-type'] || '').toLowerCase();
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`Expected image response, received ${contentType}`);
  }
  return {
    buffer: body,
    contentType: contentType || 'image/png',
  };
};

const createIllustrationMetadata = ({
  promptId,
  gamePath,
  config,
  checkpoint,
  seed,
  imagePrompt,
  sourceSceneText,
  promptGeneratedAt,
  passageIdentity,
  passageTitle,
  documentTitle,
  sourceOutputFilename,
  localFilename,
  contentType,
  byteSize,
  generatedAt,
  workflowTemplate = DEFAULT_WORKFLOW_TEMPLATE,
  workflowVersion = DEFAULT_WORKFLOW_VERSION,
}) => {
  const safeConfig = normalizeIllustratorConfig(config || {});
  const safePromptId = assertPromptId(promptId);
  const safeSceneText = typeof sourceSceneText === 'string'
    ? sourceSceneText.trim().slice(0, MAX_SCENE_TEXT_LENGTH)
    : '';
  const safeCheckpoint = typeof checkpoint === 'string' && checkpoint.trim()
    ? checkpoint.trim().slice(0, MAX_MODEL_NAME_LENGTH)
    : safeConfig.checkpoint;

  return normalizeIllustrationMetadata({
    game: {
      basename: gamePath ? path.basename(gamePath) : null,
    },
    passage: {
      identity: passageIdentity,
      title: passageTitle,
    },
    scene: {
      documentTitle,
      textExcerpt: createSceneExcerpt(safeSceneText),
      textHash: hashSceneText(safeSceneText),
    },
    prompt: {
      final: imagePrompt,
      negative: safeConfig.negativePrompt,
      textBackend: safeConfig.textBackend,
      textModel: safeConfig.textModel,
      generatedAt: promptGeneratedAt,
    },
    comfyUI: {
      endpointOrigin: safeConfig.comfyEndpoint,
      checkpoint: safeCheckpoint,
      width: safeConfig.imageWidth,
      height: safeConfig.imageHeight,
      sampler: safeConfig.sampler,
      scheduler: safeConfig.scheduler,
      steps: safeConfig.steps,
      cfg: safeConfig.cfg,
      seed,
      promptId: safePromptId,
      sourceOutputFilename,
    },
    output: {
      localFilename,
      contentType,
      byteSize,
      generatedAt,
    },
    workflow: {
      template: workflowTemplate,
      version: workflowVersion,
    },
  });
};

const createVisualPromptInstruction = (sceneText) => {
  return `You are a visual art director. Given the following scene from a text adventure game, write a concise image generation prompt (under 100 words) describing the visual scene. Focus on: setting, lighting, mood, colors, and any key characters or objects. Do not include any explanation - only the prompt text.\n\nScene:\n${sceneText}`;
};

const ensureOutputDir = async (gamePath) => {
  const outputDir = getGameSidecarDir(gamePath, 'illustrations');
  await ensureDir(outputDir);
  return outputDir;
};

const listTextModels = async (config = {}) => {
  const safeConfig = normalizeIllustratorConfig(config);

  if (safeConfig.textBackend === 'openai') {
    const json = await httpGetJson(joinEndpointPath(safeConfig.textEndpoint, '/models'), DEFAULT_TIMEOUT_MS);
    if (!Array.isArray(json.data)) {
      throw new Error('OpenAI-compatible model list did not include data[]');
    }
    return json.data.map(model => model && model.id).filter(Boolean);
  }

  const json = await httpGetJson(joinEndpointPath(safeConfig.textEndpoint, '/api/tags'), DEFAULT_TIMEOUT_MS);
  if (!Array.isArray(json.models)) {
    throw new Error('Ollama model list did not include models[]');
  }
  return json.models.map(model => model && model.name).filter(Boolean);
};

const listOllamaModels = listTextModels;

const listComfyUIModels = async (config = {}) => {
  const safeConfig = normalizeIllustratorConfig(config);
  const json = await httpGetJson(
    joinEndpointPath(safeConfig.comfyEndpoint, '/object_info/CheckpointLoaderSimple'),
    DEFAULT_TIMEOUT_MS
  );
  const inputs = json.CheckpointLoaderSimple?.input?.required?.ckpt_name;
  if (!inputs || !Array.isArray(inputs[0])) {
    throw new Error('ComfyUI checkpoint list shape was not recognized');
  }
  return inputs[0];
};

const createTextHealth = async (safeConfig) => {
  try {
    const models = await listTextModels(safeConfig);
    const modelAvailable = models.includes(safeConfig.textModel);
    return {
      status: modelAvailable ? 'ok' : 'missing_model',
      reachable: true,
      backend: safeConfig.textBackend,
      endpoint: safeConfig.textEndpoint,
      model: safeConfig.textModel,
      modelAvailable,
      modelCount: models.length,
    };
  } catch (err) {
    return {
      status: 'unreachable',
      reachable: false,
      backend: safeConfig.textBackend,
      endpoint: safeConfig.textEndpoint,
      model: safeConfig.textModel,
      modelAvailable: false,
      modelCount: 0,
      error: getErrorMessage(err),
    };
  }
};

const createComfyUIHealth = async (safeConfig) => {
  try {
    const checkpoints = await listComfyUIModels(safeConfig);
    const checkpointAvailable = checkpoints.includes(safeConfig.checkpoint);
    return {
      status: checkpointAvailable ? 'ok' : 'missing_checkpoint',
      reachable: true,
      endpoint: safeConfig.comfyEndpoint,
      checkpoint: safeConfig.checkpoint,
      checkpointAvailable,
      checkpointCount: checkpoints.length,
    };
  } catch (err) {
    return {
      status: 'unreachable',
      reachable: false,
      endpoint: safeConfig.comfyEndpoint,
      checkpoint: safeConfig.checkpoint,
      checkpointAvailable: false,
      checkpointCount: 0,
      error: getErrorMessage(err),
    };
  }
};

const checkIllustratorHealth = async (config = {}) => {
  const safeConfig = normalizeIllustratorConfig(config);
  const [text, comfyUI] = await Promise.all([
    createTextHealth(safeConfig),
    createComfyUIHealth(safeConfig),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    text,
    comfyUI,
  };
};

const generatePrompt = async (sceneText, modelOrParams, maybeConfig) => {
  const safeSceneText = assertString(sceneText, 'Scene text', MAX_SCENE_TEXT_LENGTH);
  const params = modelOrParams && typeof modelOrParams === 'object' && !Array.isArray(modelOrParams)
    ? modelOrParams
    : { model: modelOrParams, config: maybeConfig };
  const safeConfig = normalizeIllustratorConfig(params.config || {});
  const safeModel = assertString(params.model || safeConfig.textModel, 'Text model', MAX_MODEL_NAME_LENGTH);
  const prompt = createVisualPromptInstruction(safeSceneText);

  if (safeConfig.textBackend === 'openai') {
    const json = await httpPostJson(joinEndpointPath(safeConfig.textEndpoint, '/chat/completions'), {
      model: safeModel,
      messages: [
        { role: 'system', content: 'You write concise visual prompts for image generation.' },
        { role: 'user', content: prompt },
      ],
      stream: false,
      temperature: 0.4,
      max_tokens: 180,
    }, TEXT_TIMEOUT_MS);

    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('OpenAI-compatible response did not include choices[0].message.content');
    }
    return content.trim();
  }

  const json = await httpPostJson(joinEndpointPath(safeConfig.textEndpoint, '/api/generate'), {
    model: safeModel,
    prompt,
    stream: false,
  }, TEXT_TIMEOUT_MS);

  if (typeof json.response !== 'string' || json.response.trim() === '') {
    throw new Error('Ollama response did not include response text');
  }
  return json.response.trim();
};

const queueComfyUI = async (params) => {
  const { imagePrompt, outputFilename, checkpoint, config } = assertPlainObject(params, 'ComfyUI queue params');
  const safeConfig = normalizeIllustratorConfig(config || {});
  const safePrompt = assertString(imagePrompt, 'Image prompt', MAX_IMAGE_PROMPT_LENGTH);
  const safeCheckpoint = assertString(checkpoint || safeConfig.checkpoint, 'ComfyUI checkpoint', MAX_MODEL_NAME_LENGTH);
  const outputPrefix = normalizeImageFilename(`${assertString(outputFilename, 'Output filename', 128).replace(/\.png$/i, '')}.png`).replace(/\.png$/i, '');
  const seed = Math.floor(Math.random() * 1e9);

  const workflow = {
    "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": safeCheckpoint } },
    "2": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["1", 1], "text": safePrompt } },
    "3": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["1", 1], "text": safeConfig.negativePrompt } },
    "4": { "class_type": "EmptyLatentImage", "inputs": { "batch_size": 1, "height": safeConfig.imageHeight, "width": safeConfig.imageWidth } },
    "5": { "class_type": "KSampler", "inputs": { "cfg": safeConfig.cfg, "denoise": 1, "latent_image": ["4", 0], "model": ["1", 0], "negative": ["3", 0], "positive": ["2", 0], "sampler_name": safeConfig.sampler, "scheduler": safeConfig.scheduler, "seed": seed, "steps": safeConfig.steps } },
    "6": { "class_type": "VAEDecode", "inputs": { "samples": ["5", 0], "vae": ["1", 2] } },
    "7": { "class_type": "SaveImage", "inputs": { "filename_prefix": outputPrefix, "images": ["6", 0] } },
  };

  const json = await httpPostJson(joinEndpointPath(safeConfig.comfyEndpoint, '/prompt'), { prompt: workflow }, DEFAULT_TIMEOUT_MS);
  if (typeof json.prompt_id !== 'string' || json.prompt_id.trim() === '') {
    throw new Error('ComfyUI queue response did not include prompt_id');
  }
  return {
    promptId: json.prompt_id.trim(),
    seed,
    workflowTemplate: DEFAULT_WORKFLOW_TEMPLATE,
    workflowVersion: DEFAULT_WORKFLOW_VERSION,
  };
};

const pollImage = async (params) => {
  const { promptId, gamePath, config, metadata } = assertPlainObject(params, 'ComfyUI poll params');
  const safeConfig = normalizeIllustratorConfig(config || {});
  const safePromptId = assertPromptId(promptId);
  const outputDir = gamePath ? getGameSidecarDir(assertString(gamePath, 'Game path'), 'illustrations') : null;
  const metadataInput = isPlainObject(metadata) ? metadata : {};
  const historyData = await httpGetJson(
    joinEndpointPath(safeConfig.comfyEndpoint, `/history/${encodeURIComponent(safePromptId)}`),
    DEFAULT_TIMEOUT_MS
  );
  const entry = historyData[safePromptId];
  if (!entry) return { pending: true };

  const outputs = entry.outputs || {};
  for (const nodeId in outputs) {
    const images = outputs[nodeId].images;
    if (!Array.isArray(images) || images.length === 0) continue;

    const img = images[0];
    if (!img || typeof img.filename !== 'string') {
      throw new Error('ComfyUI image output did not include a filename');
    }

    const imageUrl = joinEndpointPath(safeConfig.comfyEndpoint, '/view');
    imageUrl.searchParams.set('filename', img.filename);
    imageUrl.searchParams.set('subfolder', img.subfolder || '');
    imageUrl.searchParams.set('type', img.type || 'output');

    const { buffer: imageBuffer, contentType } = await httpGetImage(imageUrl, DEFAULT_TIMEOUT_MS);
    const imageFilename = normalizeImageFilename(img.filename);
    const localPath = outputDir ? resolveChildPath(outputDir, imageFilename) : null;
    let savedLocalPath = null;
    let metadataPath = null;
    let savedMetadata = null;

    if (localPath) {
      try {
        await ensureDir(outputDir);
        await fsp.writeFile(localPath, imageBuffer);
        savedLocalPath = localPath;
      } catch (err) {
        console.warn('Illustrator: could not save local copy', getErrorMessage(err));
      }

      if (savedLocalPath) {
        savedMetadata = createIllustrationMetadata({
          promptId: safePromptId,
          gamePath,
          config: safeConfig,
          checkpoint: metadataInput.checkpoint,
          seed: metadataInput.seed,
          imagePrompt: metadataInput.imagePrompt,
          sourceSceneText: metadataInput.sourceSceneText,
          promptGeneratedAt: metadataInput.promptGeneratedAt,
          passageIdentity: metadataInput.passageIdentity,
          passageTitle: metadataInput.passageTitle,
          documentTitle: metadataInput.documentTitle,
          sourceOutputFilename: img.filename,
          localFilename: imageFilename,
          contentType,
          byteSize: imageBuffer.length,
          generatedAt: new Date().toISOString(),
          workflowTemplate: metadataInput.workflowTemplate,
          workflowVersion: metadataInput.workflowVersion,
        });

        metadataPath = `${savedLocalPath}.json`;
        try {
          await fsp.writeFile(metadataPath, JSON.stringify(savedMetadata, null, 2));
        } catch (err) {
          metadataPath = null;
          console.warn('Illustrator: could not save local metadata', getErrorMessage(err));
        }
      }
    }

    return {
      dataUrl: `data:${contentType};base64,${imageBuffer.toString('base64')}`,
      filename: imageFilename,
      localPath: savedLocalPath,
      metadataPath,
      metadata: savedMetadata,
    };
  }

  return { pending: true };
};

module.exports = {
  DEFAULT_ILLUSTRATOR_CONFIG,
  checkIllustratorHealth,
  ensureOutputDir,
  generatePrompt,
  listComfyUIModels,
  listOllamaModels,
  listTextModels,
  normalizeIllustrationMetadata,
  pollImage,
  queueComfyUI,
};
