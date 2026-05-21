const DEFAULT_ILLUSTRATOR_CONFIG = Object.freeze({
  textBackend: 'ollama',
  textEndpoint: 'http://localhost:11434',
  textModel: 'llama3.2',
  comfyEndpoint: 'http://localhost:8188',
  checkpoint: 'waiIllustriousSDXL_v160.safetensors',
  imageWidth: 1344,
  imageHeight: 768,
  sampler: 'euler',
  scheduler: 'normal',
  steps: 20,
  cfg: 7,
  seed: 'random',
  batchSize: 1,
  aspectPreset: 'vn_background',
  workflowMode: 'default',
  customWorkflowJson: '',
  negativePrompt: 'blurry, low quality, distorted anatomy, extra fingers, watermark, logo, readable text',
  maxPollingMs: 120000,
});

const TEXT_BACKENDS = new Set(['ollama', 'openai']);
const ASPECT_PRESETS = new Set(['custom', 'portrait', 'landscape', 'square', 'vn_background', 'comic_panel']);
const WORKFLOW_MODES = new Set(['default', 'custom']);
const MAX_ENDPOINT_LENGTH = 512;
const MAX_NEGATIVE_PROMPT_LENGTH = 2000;
const MAX_CUSTOM_WORKFLOW_JSON_LENGTH = 200000;

const parseNumber = (value, fallback, { min, max, integer = true }) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(clamped) : clamped;
};

const normalizeUrl = (value, fallback) => {
  const rawValue = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (rawValue.length > MAX_ENDPOINT_LENGTH) return fallback;

  const url = new URL(rawValue);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Illustrator endpoints must use http or https');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
};

const normalizeText = (value, fallback, maxLength) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
};

const normalizeSeed = (value) => {
  if (value === undefined || value === null || value === '' || value === 'random') return 'random';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 'random';
  return Math.round(Math.min(4294967295, Math.max(0, parsed)));
};

const normalizeIllustratorConfig = (config = {}) => {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const textBackend = TEXT_BACKENDS.has(source.textBackend) ? source.textBackend : DEFAULT_ILLUSTRATOR_CONFIG.textBackend;

  return {
    textBackend,
    textEndpoint: normalizeUrl(source.textEndpoint, DEFAULT_ILLUSTRATOR_CONFIG.textEndpoint),
    textModel: normalizeText(source.textModel, DEFAULT_ILLUSTRATOR_CONFIG.textModel, 256),
    comfyEndpoint: normalizeUrl(source.comfyEndpoint, DEFAULT_ILLUSTRATOR_CONFIG.comfyEndpoint),
    checkpoint: normalizeText(source.checkpoint, DEFAULT_ILLUSTRATOR_CONFIG.checkpoint, 256),
    imageWidth: parseNumber(source.imageWidth, DEFAULT_ILLUSTRATOR_CONFIG.imageWidth, { min: 256, max: 2048 }),
    imageHeight: parseNumber(source.imageHeight, DEFAULT_ILLUSTRATOR_CONFIG.imageHeight, { min: 256, max: 2048 }),
    sampler: normalizeText(source.sampler, DEFAULT_ILLUSTRATOR_CONFIG.sampler, 64),
    scheduler: normalizeText(source.scheduler, DEFAULT_ILLUSTRATOR_CONFIG.scheduler, 64),
    steps: parseNumber(source.steps, DEFAULT_ILLUSTRATOR_CONFIG.steps, { min: 1, max: 150 }),
    cfg: parseNumber(source.cfg, DEFAULT_ILLUSTRATOR_CONFIG.cfg, { min: 0, max: 30, integer: false }),
    seed: normalizeSeed(source.seed),
    batchSize: parseNumber(source.batchSize, DEFAULT_ILLUSTRATOR_CONFIG.batchSize, { min: 1, max: 4 }),
    aspectPreset: ASPECT_PRESETS.has(source.aspectPreset) ? source.aspectPreset : DEFAULT_ILLUSTRATOR_CONFIG.aspectPreset,
    workflowMode: WORKFLOW_MODES.has(source.workflowMode) ? source.workflowMode : DEFAULT_ILLUSTRATOR_CONFIG.workflowMode,
    customWorkflowJson: normalizeText(source.customWorkflowJson, DEFAULT_ILLUSTRATOR_CONFIG.customWorkflowJson, MAX_CUSTOM_WORKFLOW_JSON_LENGTH),
    negativePrompt: normalizeText(source.negativePrompt, DEFAULT_ILLUSTRATOR_CONFIG.negativePrompt, MAX_NEGATIVE_PROMPT_LENGTH),
    maxPollingMs: parseNumber(source.maxPollingMs, DEFAULT_ILLUSTRATOR_CONFIG.maxPollingMs, { min: 10000, max: 900000 }),
  };
};

module.exports = {
  DEFAULT_ILLUSTRATOR_CONFIG,
  normalizeIllustratorConfig,
};
