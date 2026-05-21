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
  PROMPT_TEMPLATE_MODES,
  createSceneExcerpt,
  normalizeIllustrationMetadata,
} = require('../shared/illustrator-helpers');

const fsp = fs.promises;
const DEFAULT_TIMEOUT_MS = 10000;
const TEXT_TIMEOUT_MS = 60000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_STYLE_BIBLE_LENGTH = 4000;
const MAX_CHARACTER_NOTES_LENGTH = 4000;
const MAX_WORLD_NOTES_LENGTH = 3000;
const MAX_RECENT_CONTEXT_LENGTH = 4000;
const MAX_PROMPT_TONE_LENGTH = 1000;
const CUSTOM_WORKFLOW_TEMPLATE = 'comfyui-custom-workflow';
const ASPECT_PRESET_DIMENSIONS = Object.freeze({
  portrait: { width: 832, height: 1216 },
  landscape: { width: 1216, height: 832 },
  square: { width: 1024, height: 1024 },
  vn_background: { width: 1344, height: 768 },
  comic_panel: { width: 1024, height: 1536 },
});
const ILLUSTRATOR_JOB_STATUSES = Object.freeze({
  QUEUED: 'queued',
  POLLING: 'polling',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELED: 'canceled',
  TIMED_OUT: 'timed_out',
});
const ACTIVE_JOB_STATUSES = new Set([
  ILLUSTRATOR_JOB_STATUSES.QUEUED,
  ILLUSTRATOR_JOB_STATUSES.POLLING,
]);
const RETRYABLE_JOB_STATUSES = new Set([
  ILLUSTRATOR_JOB_STATUSES.FAILED,
  ILLUSTRATOR_JOB_STATUSES.TIMED_OUT,
]);
const JOB_POLL_INTERVAL_MS = 2000;
const MAX_JOB_HISTORY = 50;
const MAX_JOB_SNAPSHOT_BYTES = 300 * 1024;
const illustratorJobs = new Map();

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hashSceneText = (sceneText) => {
  const text = typeof sceneText === 'string' ? sceneText.trim().slice(0, MAX_SCENE_TEXT_LENGTH) : '';
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex');
};

const nowMs = () => Date.now();

const toIso = (timestampMs = nowMs()) => new Date(timestampMs).toISOString();

const cloneJsonObject = (value, label) => {
  if (!isPlainObject(value)) return {};
  let text;
  try {
    text = JSON.stringify(value);
  } catch (err) {
    throw new Error(`${label} must be JSON serializable`);
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_JOB_SNAPSHOT_BYTES) {
    throw new Error(`${label} is too large`);
  }
  return JSON.parse(text);
};

const touchJob = (job, timestampMs = nowMs()) => {
  job.timestamps.updatedAt = toIso(timestampMs);
};

const clearJobTimer = (job) => {
  if (job && job.pollTimer) {
    clearTimeout(job.pollTimer);
    job.pollTimer = null;
  }
};

const isActiveJob = (job) => Boolean(job && ACTIVE_JOB_STATUSES.has(job.status));

const getTerminalTimestampMs = (job) => {
  const timestamp = job.timestamps.completedAt ||
    job.timestamps.failedAt ||
    job.timestamps.canceledAt ||
    job.timestamps.timedOutAt;
  return timestamp ? Date.parse(timestamp) : null;
};

const getJobElapsedMs = (job, timestampMs = nowMs()) => {
  const startedAt = Date.parse(job.timestamps.pollingStartedAt || job.timestamps.createdAt);
  const endedAt = getTerminalTimestampMs(job) || timestampMs;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  return Math.max(0, endedAt - startedAt);
};

const serializeJob = (job, { includeOutputData = true, timestampMs = nowMs() } = {}) => {
  if (!job) return null;
  const output = job.output
    ? {
        ...job.output,
        dataUrl: includeOutputData ? job.output.dataUrl : undefined,
      }
    : null;
  if (output && output.dataUrl === undefined) delete output.dataUrl;

  return {
    jobId: job.jobId,
    retryOfJobId: job.retryOfJobId,
    promptId: job.promptId,
    status: job.status,
    timestamps: { ...job.timestamps },
    elapsedMs: getJobElapsedMs(job, timestampMs),
    prompt: { ...job.promptSnapshot },
    config: { ...job.configSnapshot },
    metadata: { ...job.metadataSnapshot },
    lastError: job.lastError,
    seed: job.seed,
    width: job.width,
    height: job.height,
    workflowTemplate: job.workflowTemplate,
    workflowVersion: job.workflowVersion,
    output,
  };
};

const pruneJobHistory = () => {
  if (illustratorJobs.size <= MAX_JOB_HISTORY) return;
  const removableJobs = [...illustratorJobs.values()]
    .filter(job => !isActiveJob(job))
    .sort((a, b) => Date.parse(a.timestamps.createdAt) - Date.parse(b.timestamps.createdAt));
  while (illustratorJobs.size > MAX_JOB_HISTORY && removableJobs.length > 0) {
    const job = removableJobs.shift();
    clearJobTimer(job);
    illustratorJobs.delete(job.jobId);
  }
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
  imageWidth,
  imageHeight,
  imagePrompt,
  promptTemplateMode,
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
      templateMode: promptTemplateMode,
      textBackend: safeConfig.textBackend,
      textModel: safeConfig.textModel,
      generatedAt: promptGeneratedAt,
    },
    comfyUI: {
      endpointOrigin: safeConfig.comfyEndpoint,
      checkpoint: safeCheckpoint,
      width: imageWidth || safeConfig.imageWidth,
      height: imageHeight || safeConfig.imageHeight,
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

const normalizeOptionalPromptText = (value, label, maxLength) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return '';
  if (!value.trim()) return '';
  const text = assertString(value, label, maxLength);
  return text;
};

const normalizePromptMode = (mode) => {
  return Object.prototype.hasOwnProperty.call(PROMPT_TEMPLATE_MODES, mode) ? mode : 'vn_background';
};

const getModeInstruction = (mode) => {
  switch (mode) {
    case 'vn_character_cg':
      return 'Create a visual novel character CG prompt focused on the key character pose, expression, outfit, lighting, and background support.';
    case 'comic_panel':
      return 'Create a western comic panel prompt with clear panel composition, camera angle, action, environment, and dramatic lighting.';
    case 'manga_panel':
      return 'Create a manga panel prompt with monochrome-friendly composition, expressive posing, screen-tone-ready lighting, and cinematic framing.';
    case 'concept_art':
      return 'Create a concept art prompt emphasizing design clarity, mood, materials, environment, and production-art readability.';
    case 'vn_background':
    default:
      return 'Create a visual novel scene background prompt focused on setting, mood, time of day, lighting, color palette, and reusable background details.';
  }
};

const createVisualPromptInstruction = (sceneText, promptContext = {}) => {
  const safeSceneText = assertString(sceneText, 'Scene text', MAX_SCENE_TEXT_LENGTH);
  const context = isPlainObject(promptContext) ? promptContext : {};
  const mode = normalizePromptMode(context.mode || context.shotMode);
  const recentContext = normalizeOptionalPromptText(context.recentContext, 'Recent scene context', MAX_RECENT_CONTEXT_LENGTH);
  const styleBible = normalizeOptionalPromptText(context.styleBible, 'Style bible', MAX_STYLE_BIBLE_LENGTH);
  const characterNotes = normalizeOptionalPromptText(context.characterNotes || context.characterRoster, 'Character notes', MAX_CHARACTER_NOTES_LENGTH);
  const worldNotes = normalizeOptionalPromptText(context.worldNotes, 'World notes', MAX_WORLD_NOTES_LENGTH);
  const promptTone = normalizeOptionalPromptText(context.promptTone || context.tone, 'Prompt tone', MAX_PROMPT_TONE_LENGTH);

  const sections = [
    'You are a visual art director adapting a Twine scene into image-generation art.',
    getModeInstruction(mode),
    'Write one concise image prompt under 100 words. Output only the prompt text, with no explanation.',
    'Avoid speech bubbles, captions, UI, watermarks, logos, and readable text unless the scene explicitly requires readable text.',
    `Template mode: ${PROMPT_TEMPLATE_MODES[mode]}.`,
  ];

  if (styleBible) sections.push(`Visual style bible:\n${styleBible}`);
  if (characterNotes) sections.push(`Character roster and continuity notes:\n${characterNotes}`);
  if (worldNotes) sections.push(`World and location notes:\n${worldNotes}`);
  if (promptTone) sections.push(`Prompt language and tone preferences:\n${promptTone}`);
  if (recentContext) sections.push(`Recent story context:\n${recentContext}`);
  sections.push(`Current scene:\n${safeSceneText}`);

  return sections.join('\n\n');
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

const generatePrompt = async (sceneText, modelOrParams, maybeConfig, maybePromptContext) => {
  const safeSceneText = assertString(sceneText, 'Scene text', MAX_SCENE_TEXT_LENGTH);
  const params = modelOrParams && typeof modelOrParams === 'object' && !Array.isArray(modelOrParams)
    ? modelOrParams
    : { model: modelOrParams, config: maybeConfig, promptContext: maybePromptContext };
  const safeConfig = normalizeIllustratorConfig(params.config || {});
  const safeModel = assertString(params.model || safeConfig.textModel, 'Text model', MAX_MODEL_NAME_LENGTH);
  const prompt = createVisualPromptInstruction(safeSceneText, params.promptContext || {});

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

const getWorkflowDimensions = (safeConfig) => {
  const preset = ASPECT_PRESET_DIMENSIONS[safeConfig.aspectPreset];
  if (preset) return preset;
  return {
    width: safeConfig.imageWidth,
    height: safeConfig.imageHeight,
  };
};

const resolveWorkflowSeed = (seed) => {
  if (seed === 'random') return Math.floor(Math.random() * 1e9);
  return seed;
};

const replaceWorkflowPlaceholders = (value, replacements) => {
  if (Array.isArray(value)) {
    return value.map(item => replaceWorkflowPlaceholders(item, replacements));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, replaceWorkflowPlaceholders(child, replacements)])
    );
  }

  if (typeof value !== 'string') return value;

  const exact = value.match(/^\{\{([a-z_]+)\}\}$/);
  if (exact && Object.prototype.hasOwnProperty.call(replacements, exact[1])) {
    return replacements[exact[1]];
  }

  return value.replace(/\{\{([a-z_]+)\}\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(replacements, name)) return match;
    return String(replacements[name]);
  });
};

const parseCustomWorkflow = (workflowJson) => {
  try {
    const workflow = JSON.parse(assertString(workflowJson, 'Custom workflow JSON', 200000));
    if (!isPlainObject(workflow)) {
      throw new Error('Custom workflow must be a JSON object');
    }
    return workflow;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('Custom workflow JSON is invalid');
    }
    throw err;
  }
};

const validateCustomWorkflow = (workflow) => {
  const nodes = Object.values(workflow);
  const hasPromptNode = nodes.some(node => {
    if (!isPlainObject(node)) return false;
    const classType = String(node.class_type || '').toLowerCase();
    const inputs = isPlainObject(node.inputs) ? node.inputs : {};
    return classType.includes('cliptextencode') ||
      Object.values(inputs).some(value => typeof value === 'string' && value.includes('{{prompt}}'));
  });
  const hasImageOutputNode = nodes.some(node => {
    if (!isPlainObject(node)) return false;
    return String(node.class_type || '').toLowerCase().includes('saveimage');
  });

  if (!hasPromptNode) {
    throw new Error('Custom workflow must include a prompt text node');
  }
  if (!hasImageOutputNode) {
    throw new Error('Custom workflow must include a SaveImage output node');
  }
};

const buildDefaultComfyUIWorkflow = ({ safePrompt, safeCheckpoint, safeConfig, outputPrefix, seed, width, height }) => {
  return {
    "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": safeCheckpoint } },
    "2": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["1", 1], "text": safePrompt } },
    "3": { "class_type": "CLIPTextEncode", "inputs": { "clip": ["1", 1], "text": safeConfig.negativePrompt } },
    "4": { "class_type": "EmptyLatentImage", "inputs": { "batch_size": safeConfig.batchSize, "height": height, "width": width } },
    "5": { "class_type": "KSampler", "inputs": { "cfg": safeConfig.cfg, "denoise": 1, "latent_image": ["4", 0], "model": ["1", 0], "negative": ["3", 0], "positive": ["2", 0], "sampler_name": safeConfig.sampler, "scheduler": safeConfig.scheduler, "seed": seed, "steps": safeConfig.steps } },
    "6": { "class_type": "VAEDecode", "inputs": { "samples": ["5", 0], "vae": ["1", 2] } },
    "7": { "class_type": "SaveImage", "inputs": { "filename_prefix": outputPrefix, "images": ["6", 0] } },
  };
};

const buildComfyUIWorkflow = (params) => {
  const { imagePrompt, outputFilename, checkpoint, config } = assertPlainObject(params, 'ComfyUI workflow params');
  const safeConfig = normalizeIllustratorConfig(config || {});
  const safePrompt = assertString(imagePrompt, 'Image prompt', MAX_IMAGE_PROMPT_LENGTH);
  const safeCheckpoint = assertString(checkpoint || safeConfig.checkpoint, 'ComfyUI checkpoint', MAX_MODEL_NAME_LENGTH);
  const outputPrefix = normalizeImageFilename(`${assertString(outputFilename, 'Output filename', 128).replace(/\.png$/i, '')}.png`).replace(/\.png$/i, '');
  const seed = resolveWorkflowSeed(safeConfig.seed);
  const { width, height } = getWorkflowDimensions(safeConfig);

  if (safeConfig.workflowMode === 'custom') {
    const rawWorkflow = parseCustomWorkflow(safeConfig.customWorkflowJson);
    validateCustomWorkflow(rawWorkflow);
    const workflow = replaceWorkflowPlaceholders(rawWorkflow, {
      prompt: safePrompt,
      negative_prompt: safeConfig.negativePrompt,
      checkpoint: safeCheckpoint,
      seed,
      width,
      height,
      batch_size: safeConfig.batchSize,
      output_prefix: outputPrefix,
    });

    return {
      workflow,
      seed,
      width,
      height,
      outputPrefix,
      workflowTemplate: CUSTOM_WORKFLOW_TEMPLATE,
      workflowVersion: DEFAULT_WORKFLOW_VERSION,
    };
  }

  return {
    workflow: buildDefaultComfyUIWorkflow({ safePrompt, safeCheckpoint, safeConfig, outputPrefix, seed, width, height }),
    seed,
    width,
    height,
    outputPrefix,
    workflowTemplate: DEFAULT_WORKFLOW_TEMPLATE,
    workflowVersion: DEFAULT_WORKFLOW_VERSION,
  };
};

const queueComfyUI = async (params) => {
  const built = buildComfyUIWorkflow(assertPlainObject(params, 'ComfyUI queue params'));

  const safeConfig = normalizeIllustratorConfig(params.config || {});
  const json = await httpPostJson(joinEndpointPath(safeConfig.comfyEndpoint, '/prompt'), { prompt: built.workflow }, DEFAULT_TIMEOUT_MS);
  if (typeof json.prompt_id !== 'string' || json.prompt_id.trim() === '') {
    throw new Error('ComfyUI queue response did not include prompt_id');
  }
  return {
    promptId: json.prompt_id.trim(),
    seed: built.seed,
    width: built.width,
    height: built.height,
    workflowTemplate: built.workflowTemplate,
    workflowVersion: built.workflowVersion,
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
          imageWidth: metadataInput.width,
          imageHeight: metadataInput.height,
          imagePrompt: metadataInput.imagePrompt,
          promptTemplateMode: metadataInput.promptTemplateMode,
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

const normalizeGenerationRequest = (params) => {
  const source = assertPlainObject(params, 'Illustrator generation params');
  const safeConfig = normalizeIllustratorConfig(source.config || {});
  const imagePrompt = assertString(source.imagePrompt, 'Image prompt', MAX_IMAGE_PROMPT_LENGTH);
  const outputFilename = normalizeImageFilename(
    `${assertString(source.outputFilename, 'Output filename', 128).replace(/\.png$/i, '')}.png`
  );
  const checkpoint = assertString(source.checkpoint || safeConfig.checkpoint, 'ComfyUI checkpoint', MAX_MODEL_NAME_LENGTH);
  const metadata = cloneJsonObject(isPlainObject(source.metadata) ? source.metadata : {}, 'Generation metadata');
  const gamePath = source.gamePath ? assertString(source.gamePath, 'Game path') : null;

  return {
    imagePrompt,
    outputFilename,
    checkpoint,
    config: safeConfig,
    metadata,
    gamePath,
  };
};

const createIllustratorJob = (request, { retryOfJobId = null, requireAuthorizedGamePath = null } = {}) => {
  const timestampMs = nowMs();
  const job = {
    jobId: crypto.randomUUID(),
    retryOfJobId,
    promptId: null,
    status: ILLUSTRATOR_JOB_STATUSES.QUEUED,
    timestamps: {
      createdAt: toIso(timestampMs),
      queuedAt: toIso(timestampMs),
      pollingStartedAt: null,
      completedAt: null,
      failedAt: null,
      canceledAt: null,
      timedOutAt: null,
      updatedAt: toIso(timestampMs),
    },
    promptSnapshot: {
      imagePrompt: request.imagePrompt,
      outputFilename: request.outputFilename,
      checkpoint: request.checkpoint,
    },
    configSnapshot: request.config,
    metadataSnapshot: request.metadata,
    gamePath: request.gamePath,
    requireAuthorizedGamePath,
    lastError: null,
    seed: null,
    width: null,
    height: null,
    workflowTemplate: null,
    workflowVersion: null,
    output: null,
    pollTimer: null,
    pollPromise: null,
  };

  illustratorJobs.set(job.jobId, job);
  pruneJobHistory();
  return job;
};

const setJobStatus = (job, status, timestampField, timestampMs = nowMs()) => {
  job.status = status;
  if (timestampField) job.timestamps[timestampField] = toIso(timestampMs);
  touchJob(job, timestampMs);
};

const markJobFailed = (job, err, timestampMs = nowMs()) => {
  clearJobTimer(job);
  job.lastError = getErrorMessage(err);
  setJobStatus(job, ILLUSTRATOR_JOB_STATUSES.FAILED, 'failedAt', timestampMs);
};

const markJobTimedOut = (job, timestampMs = nowMs()) => {
  clearJobTimer(job);
  job.lastError = 'Generation timed out before ComfyUI returned an image';
  setJobStatus(job, ILLUSTRATOR_JOB_STATUSES.TIMED_OUT, 'timedOutAt', timestampMs);
};

const buildJobPollMetadata = (job) => {
  return {
    ...job.metadataSnapshot,
    checkpoint: job.metadataSnapshot.checkpoint || job.promptSnapshot.checkpoint,
    seed: job.seed,
    width: job.width,
    height: job.height,
    workflowTemplate: job.workflowTemplate,
    workflowVersion: job.workflowVersion,
  };
};

const getAuthorizedJobGamePath = async (job) => {
  if (!job.gamePath) return null;
  if (typeof job.requireAuthorizedGamePath !== 'function') return job.gamePath;
  return await job.requireAuthorizedGamePath(job.gamePath);
};

const isJobTimedOut = (job, timestampMs = nowMs()) => {
  const startedAt = Date.parse(job.timestamps.pollingStartedAt || job.timestamps.createdAt);
  return Number.isFinite(startedAt) && timestampMs - startedAt > job.configSnapshot.maxPollingMs;
};

const scheduleJobPoll = (job, delayMs = JOB_POLL_INTERVAL_MS) => {
  if (!isActiveJob(job)) return;
  clearJobTimer(job);
  job.pollTimer = setTimeout(() => {
    advanceIllustratorJob(job.jobId).catch((err) => {
      const currentJob = illustratorJobs.get(job.jobId);
      if (currentJob && isActiveJob(currentJob)) {
        markJobFailed(currentJob, err);
      }
    });
  }, delayMs);
  if (typeof job.pollTimer.unref === 'function') {
    job.pollTimer.unref();
  }
};

const advanceIllustratorJob = async (jobId, { timestampMs = nowMs() } = {}) => {
  const job = illustratorJobs.get(assertString(jobId, 'Illustrator job id', 128));
  if (!job) throw new Error('Illustrator job was not found');
  if (!isActiveJob(job)) return serializeJob(job, { timestampMs });
  if (job.pollPromise) {
    await job.pollPromise;
    return serializeJob(job, { timestampMs });
  }
  if (!job.promptId) return serializeJob(job, { timestampMs });
  if (isJobTimedOut(job, timestampMs)) {
    markJobTimedOut(job, timestampMs);
    return serializeJob(job, { timestampMs });
  }

  clearJobTimer(job);
  job.pollPromise = (async () => {
    try {
      const gamePath = await getAuthorizedJobGamePath(job);
      const result = await pollImage({
        promptId: job.promptId,
        gamePath,
        config: job.configSnapshot,
        metadata: buildJobPollMetadata(job),
      });
      if (result.pending) {
        touchJob(job, timestampMs);
        scheduleJobPoll(job);
        return;
      }

      job.output = {
        dataUrl: result.dataUrl,
        filename: result.filename,
        localPath: result.localPath,
        metadataPath: result.metadataPath,
        metadata: result.metadata,
      };
      job.lastError = null;
      setJobStatus(job, ILLUSTRATOR_JOB_STATUSES.COMPLETED, 'completedAt', timestampMs);
    } catch (err) {
      markJobFailed(job, err, timestampMs);
    } finally {
      job.pollPromise = null;
    }
  })();

  await job.pollPromise;
  return serializeJob(job, { timestampMs });
};

const startIllustratorGeneration = async (params, options = {}) => {
  const request = normalizeGenerationRequest(params);
  const job = createIllustratorJob(request, {
    retryOfJobId: options.retryOfJobId || params.retryOfJobId || null,
    requireAuthorizedGamePath: options.requireAuthorizedGamePath || null,
  });

  try {
    const queued = await queueComfyUI({
      imagePrompt: request.imagePrompt,
      outputFilename: request.outputFilename,
      checkpoint: request.checkpoint,
      config: request.config,
    });
    job.promptId = queued.promptId;
    job.seed = queued.seed;
    job.width = queued.width;
    job.height = queued.height;
    job.workflowTemplate = queued.workflowTemplate;
    job.workflowVersion = queued.workflowVersion;
    setJobStatus(job, ILLUSTRATOR_JOB_STATUSES.POLLING, 'pollingStartedAt');
    scheduleJobPoll(job);
  } catch (err) {
    markJobFailed(job, err);
  }

  return serializeJob(job);
};

const getIllustratorJob = async (jobId, options = {}) => {
  const job = illustratorJobs.get(assertString(jobId, 'Illustrator job id', 128));
  if (!job) throw new Error('Illustrator job was not found');
  if (isActiveJob(job) && !job.pollPromise) {
    return await advanceIllustratorJob(job.jobId, options);
  }
  if (job.pollPromise) await job.pollPromise;
  return serializeJob(job, options);
};

const listIllustratorJobs = ({ gamePath, includeOutputData = false, limit = 20 } = {}) => {
  const safeGamePath = gamePath ? assertString(gamePath, 'Game path') : null;
  const safeLimit = Math.min(100, Math.max(1, Number.isFinite(Number(limit)) ? Math.round(Number(limit)) : 20));
  return [...illustratorJobs.values()]
    .filter(job => !safeGamePath || job.gamePath === safeGamePath)
    .sort((a, b) => Date.parse(b.timestamps.createdAt) - Date.parse(a.timestamps.createdAt))
    .slice(0, safeLimit)
    .map(job => serializeJob(job, { includeOutputData }));
};

const cancelIllustratorJob = (jobId) => {
  const job = illustratorJobs.get(assertString(jobId, 'Illustrator job id', 128));
  if (!job) throw new Error('Illustrator job was not found');
  if (isActiveJob(job)) {
    clearJobTimer(job);
    job.lastError = null;
    setJobStatus(job, ILLUSTRATOR_JOB_STATUSES.CANCELED, 'canceledAt');
  }
  return serializeJob(job);
};

const retryIllustratorJob = async (jobId) => {
  const job = illustratorJobs.get(assertString(jobId, 'Illustrator job id', 128));
  if (!job) throw new Error('Illustrator job was not found');
  if (!RETRYABLE_JOB_STATUSES.has(job.status)) {
    throw new Error('Only failed or timed out Illustrator jobs can be retried');
  }

  return await startIllustratorGeneration({
    imagePrompt: job.promptSnapshot.imagePrompt,
    outputFilename: job.promptSnapshot.outputFilename,
    checkpoint: job.promptSnapshot.checkpoint,
    config: job.configSnapshot,
    metadata: job.metadataSnapshot,
    gamePath: job.gamePath,
    retryOfJobId: job.jobId,
  }, {
    retryOfJobId: job.jobId,
    requireAuthorizedGamePath: job.requireAuthorizedGamePath,
  });
};

const clearIllustratorJobsForTest = () => {
  for (const job of illustratorJobs.values()) {
    clearJobTimer(job);
  }
  illustratorJobs.clear();
};

module.exports = {
  DEFAULT_ILLUSTRATOR_CONFIG,
  ILLUSTRATOR_JOB_STATUSES,
  advanceIllustratorJob,
  buildComfyUIWorkflow,
  cancelIllustratorJob,
  checkIllustratorHealth,
  clearIllustratorJobsForTest,
  createVisualPromptInstruction,
  ensureOutputDir,
  generatePrompt,
  getIllustratorJob,
  listComfyUIModels,
  listIllustratorJobs,
  listOllamaModels,
  listTextModels,
  normalizeIllustrationMetadata,
  pollImage,
  queueComfyUI,
  retryIllustratorJob,
  startIllustratorGeneration,
};
