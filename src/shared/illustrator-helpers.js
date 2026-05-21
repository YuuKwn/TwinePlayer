(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.TwinePlayerIllustratorHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const DEFAULT_RENDERER_ILLUSTRATOR_CONFIG = Object.freeze({
    textBackend: 'ollama',
    textEndpoint: 'http://localhost:11434',
    textModel: 'llama3.2',
    comfyEndpoint: 'http://localhost:8188',
    checkpoint: 'waiIllustriousSDXL_v160.safetensors',
    imageWidth: 832,
    imageHeight: 1216,
    sampler: 'euler',
    scheduler: 'normal',
    steps: 20,
    cfg: 7,
    negativePrompt: 'blurry, low quality, watermark, text, ugly',
    maxPollingMs: 120000,
  });

  const TEXT_BACKENDS = new Set(['ollama', 'openai']);
  const SAFE_FILENAME_PART_PATTERN = /[^a-z0-9_-]+/gi;
  const MAX_METADATA_STRING_LENGTH = 512;
  const MAX_METADATA_TEXT_LENGTH = 5000;
  const MAX_SCENE_EXCERPT_LENGTH = 2000;
  const MAX_SCENE_CONTEXT_TEXT_LENGTH = 10000;
  const DEFAULT_SCENE_HISTORY_LIMIT = 6;
  const DEFAULT_WORKFLOW_TEMPLATE = 'comfyui-default-txt2img';
  const DEFAULT_WORKFLOW_VERSION = 1;
  const DEFAULT_SERVICE_PROFILES = Object.freeze([
    {
      id: 'local-ollama-local-comfyui',
      name: 'Local Ollama + Local ComfyUI',
      config: DEFAULT_RENDERER_ILLUSTRATOR_CONFIG,
      builtIn: true,
    },
    {
      id: 'lan-openai-local-comfyui',
      name: 'LAN OpenAI-compatible + Local ComfyUI',
      config: {
        ...DEFAULT_RENDERER_ILLUSTRATOR_CONFIG,
        textBackend: 'openai',
        textEndpoint: 'http://192.168.1.10:8000/v1',
      },
      builtIn: true,
    },
  ]);

  const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

  const pickMetadataValue = (...values) => values.find(value => value !== undefined && value !== null);

  const parseNumber = (value, fallback, { min, max, integer = true }) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const clamped = Math.min(max, Math.max(min, parsed));
    return integer ? Math.round(clamped) : clamped;
  };

  const normalizeText = (value, fallback, maxLength) => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return trimmed.slice(0, maxLength);
  };

  const normalizeRendererIllustratorConfig = (config = {}, defaults = DEFAULT_RENDERER_ILLUSTRATOR_CONFIG) => {
    const source = isPlainObject(config) ? config : {};
    const safeDefaults = {
      ...DEFAULT_RENDERER_ILLUSTRATOR_CONFIG,
      ...(isPlainObject(defaults) ? defaults : {}),
    };
    const textBackend = TEXT_BACKENDS.has(source.textBackend) ? source.textBackend : safeDefaults.textBackend;

    return {
      textBackend,
      textEndpoint: normalizeText(source.textEndpoint, safeDefaults.textEndpoint, 512),
      textModel: normalizeText(source.textModel, safeDefaults.textModel, 256),
      comfyEndpoint: normalizeText(source.comfyEndpoint, safeDefaults.comfyEndpoint, 512),
      checkpoint: normalizeText(source.checkpoint, safeDefaults.checkpoint, 256),
      imageWidth: parseNumber(source.imageWidth, safeDefaults.imageWidth, { min: 256, max: 2048 }),
      imageHeight: parseNumber(source.imageHeight, safeDefaults.imageHeight, { min: 256, max: 2048 }),
      sampler: normalizeText(source.sampler, safeDefaults.sampler, 64),
      scheduler: normalizeText(source.scheduler, safeDefaults.scheduler, 64),
      steps: parseNumber(source.steps, safeDefaults.steps, { min: 1, max: 150 }),
      cfg: parseNumber(source.cfg, safeDefaults.cfg, { min: 0, max: 30, integer: false }),
      negativePrompt: normalizeText(source.negativePrompt, safeDefaults.negativePrompt, 2000),
      maxPollingMs: parseNumber(source.maxPollingMs, safeDefaults.maxPollingMs, { min: 10000, max: 900000 }),
    };
  };

  const createSceneExcerpt = (text, maxLength = MAX_SCENE_EXCERPT_LENGTH) => {
    if (typeof text !== 'string') return '';
    return text.trim().replace(/\s+/g, ' ').slice(0, Math.max(0, maxLength));
  };

  const hashSceneText = (text) => {
    const source = typeof text === 'string' ? text.trim() : '';
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index++) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };

  const normalizeSceneContext = (raw = {}) => {
    const source = isPlainObject(raw) ? raw : {};
    const text = typeof source.text === 'string'
      ? source.text.trim().slice(0, MAX_SCENE_CONTEXT_TEXT_LENGTH)
      : '';
    const sceneHash = hashSceneText(text);
    const passageName = normalizeOptionalString(source.passageName, 256);
    const passageIdentity = normalizeOptionalString(source.passageIdentity, 256) || passageName || sceneHash;

    return {
      text,
      textExcerpt: createSceneExcerpt(text, MAX_SCENE_EXCERPT_LENGTH),
      sceneHash,
      documentTitle: normalizeOptionalString(source.documentTitle, 256),
      passageName,
      passageIdentity,
      engine: normalizeOptionalString(source.engine, 64),
      capturedAt: normalizeIsoTimestamp(source.capturedAt) || new Date().toISOString(),
    };
  };

  const updateSceneContextHistory = (history = [], context, limit = DEFAULT_SCENE_HISTORY_LIMIT) => {
    const normalized = normalizeSceneContext(context);
    if (!normalized.text) {
      return Array.isArray(history) ? history.slice(0, limit) : [];
    }

    const existing = Array.isArray(history) ? history : [];
    const withoutDuplicate = existing.filter(item => {
      const previous = normalizeSceneContext(item);
      return previous.sceneHash !== normalized.sceneHash ||
        previous.passageIdentity !== normalized.passageIdentity;
    });

    return [normalized].concat(withoutDuplicate).slice(0, Math.max(1, limit));
  };

  const sanitizeFilenamePart = (value) => {
    const cleaned = String(value || '')
      .trim()
      .toLowerCase()
      .replace(SAFE_FILENAME_PART_PATTERN, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return cleaned || 'scene';
  };

  const createServiceProfileId = (name, fallbackSuffix = '') => {
    const base = sanitizeFilenamePart(name).slice(0, 64);
    const suffix = String(fallbackSuffix || '').trim()
      ? sanitizeFilenamePart(fallbackSuffix).slice(0, 32)
      : '';
    return suffix ? `${base}-${suffix}` : base;
  };

  const normalizeServiceProfile = (profile, fallbackIndex = 0, builtIn = false) => {
    if (!isPlainObject(profile)) return null;
    const name = normalizeText(profile.name, '', 80);
    if (!name) return null;
    const id = normalizeText(profile.id, createServiceProfileId(name, String(fallbackIndex)), 96);

    return {
      id: createServiceProfileId(id, ''),
      name,
      config: normalizeRendererIllustratorConfig(profile.config || {}),
      builtIn: Boolean(profile.builtIn || builtIn),
    };
  };

  const normalizeServiceProfiles = (rawProfiles = {}) => {
    const storedProfiles = Array.isArray(rawProfiles)
      ? rawProfiles
      : (isPlainObject(rawProfiles) && Array.isArray(rawProfiles.profiles) ? rawProfiles.profiles : []);
    const profiles = [];
    const seenIds = new Set();

    DEFAULT_SERVICE_PROFILES.forEach((profile, index) => {
      const normalized = normalizeServiceProfile(profile, index, true);
      if (normalized && !seenIds.has(normalized.id)) {
        seenIds.add(normalized.id);
        profiles.push(normalized);
      }
    });

    storedProfiles.forEach((profile, index) => {
      const normalized = normalizeServiceProfile(profile, index, false);
      if (normalized && !seenIds.has(normalized.id)) {
        seenIds.add(normalized.id);
        profiles.push(normalized);
      }
    });

    return profiles;
  };

  const isPrivateIpv4 = (hostname) => {
    const parts = hostname.split('.').map(part => Number(part));
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [first, second] = parts;
    return first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254);
  };

  const classifyEndpointHost = (endpoint) => {
    try {
      const url = new URL(endpoint);
      const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { kind: 'invalid', label: 'Invalid' };
      }

      if (
        hostname === 'localhost' ||
        hostname === '::1' ||
        hostname === '0:0:0:0:0:0:0:1' ||
        hostname.startsWith('127.')
      ) {
        return { kind: 'local', label: 'Local' };
      }

      if (hostname.endsWith('.local') || isPrivateIpv4(hostname)) {
        return { kind: 'lan', label: 'LAN' };
      }

      return { kind: 'remote', label: 'Remote' };
    } catch (err) {
      return { kind: 'invalid', label: 'Invalid' };
    }
  };

  const createOutputFilename = (now = Date.now(), passageIdentity = '') => {
    const date = now instanceof Date ? now : new Date(now);
    const timestamp = Number.isFinite(date.getTime())
      ? date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
      : new Date(0).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `twineplayer_${timestamp}_${sanitizeFilenamePart(passageIdentity)}.png`;
  };

  const getIllustrationDisplayState = (status = 'idle', hasImage = false) => {
    const safeStatus = ['idle', 'working', 'done', 'error', 'canceled'].includes(status) ? status : 'idle';
    const imageVisible = Boolean(hasImage) && safeStatus !== 'working';

    return {
      status: safeStatus,
      showSpinner: safeStatus === 'working',
      showPlaceholder: safeStatus !== 'working' && !imageVisible,
      showImage: imageVisible,
      showDownload: imageVisible,
      showCancel: safeStatus === 'working',
      canGenerate: safeStatus !== 'working',
    };
  };

  const normalizeOptionalString = (value, maxLength = MAX_METADATA_STRING_LENGTH) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maxLength);
  };

  const normalizeOptionalNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalizeOptionalInteger = (value) => {
    const parsed = normalizeOptionalNumber(value);
    return parsed === null ? null : Math.round(parsed);
  };

  const normalizeIsoTimestamp = (value) => {
    const timestamp = normalizeOptionalString(value, 64);
    if (!timestamp) return null;
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  };

  const normalizeEndpointOrigin = (value) => {
    const endpoint = normalizeOptionalString(value);
    if (!endpoint) return null;

    try {
      return new URL(endpoint).origin;
    } catch (err) {
      return null;
    }
  };

  const normalizeIllustrationMetadata = (raw = {}) => {
    const source = isPlainObject(raw) ? raw : {};
    const game = isPlainObject(source.game) ? source.game : {};
    const passage = isPlainObject(source.passage) ? source.passage : {};
    const scene = isPlainObject(source.scene) ? source.scene : {};
    const prompt = isPlainObject(source.prompt) ? source.prompt : {};
    const comfyUI = isPlainObject(source.comfyUI) ? source.comfyUI : {};
    const output = isPlainObject(source.output) ? source.output : {};
    const workflow = isPlainObject(source.workflow) ? source.workflow : {};

    return {
      twinePlayerIllustrationVersion: 1,
      game: {
        basename: normalizeOptionalString(pickMetadataValue(game.basename, source.gameBasename, source.gameName), 255),
      },
      passage: {
        identity: normalizeOptionalString(pickMetadataValue(passage.identity, source.passageIdentity)),
        title: normalizeOptionalString(pickMetadataValue(passage.title, source.passageTitle)),
      },
      scene: {
        documentTitle: normalizeOptionalString(pickMetadataValue(scene.documentTitle, source.documentTitle)),
        textExcerpt: normalizeOptionalString(pickMetadataValue(scene.textExcerpt, source.sceneTextExcerpt), MAX_SCENE_EXCERPT_LENGTH),
        textHash: normalizeOptionalString(pickMetadataValue(scene.textHash, source.sceneTextHash), 128),
      },
      prompt: {
        final: normalizeOptionalString(pickMetadataValue(prompt.final, source.imagePrompt), MAX_METADATA_TEXT_LENGTH),
        negative: normalizeOptionalString(pickMetadataValue(prompt.negative, source.negativePrompt), MAX_METADATA_TEXT_LENGTH),
        textBackend: normalizeOptionalString(pickMetadataValue(prompt.textBackend, source.textBackend), 64),
        textModel: normalizeOptionalString(pickMetadataValue(prompt.textModel, source.textModel), 256),
        generatedAt: normalizeIsoTimestamp(pickMetadataValue(prompt.generatedAt, source.promptGeneratedAt)),
      },
      comfyUI: {
        endpointOrigin: normalizeEndpointOrigin(pickMetadataValue(comfyUI.endpointOrigin, source.comfyEndpointOrigin)),
        checkpoint: normalizeOptionalString(pickMetadataValue(comfyUI.checkpoint, source.checkpoint), 256),
        width: normalizeOptionalInteger(pickMetadataValue(comfyUI.width, source.imageWidth)),
        height: normalizeOptionalInteger(pickMetadataValue(comfyUI.height, source.imageHeight)),
        sampler: normalizeOptionalString(pickMetadataValue(comfyUI.sampler, source.sampler), 64),
        scheduler: normalizeOptionalString(pickMetadataValue(comfyUI.scheduler, source.scheduler), 64),
        steps: normalizeOptionalInteger(pickMetadataValue(comfyUI.steps, source.steps)),
        cfg: normalizeOptionalNumber(pickMetadataValue(comfyUI.cfg, source.cfg)),
        seed: normalizeOptionalInteger(pickMetadataValue(comfyUI.seed, source.seed)),
        promptId: normalizeOptionalString(pickMetadataValue(comfyUI.promptId, source.promptId), 128),
        sourceOutputFilename: normalizeOptionalString(pickMetadataValue(comfyUI.sourceOutputFilename, source.sourceOutputFilename, source.filename), 255),
      },
      output: {
        localFilename: normalizeOptionalString(pickMetadataValue(output.localFilename, source.localFilename, source.filename), 255),
        contentType: normalizeOptionalString(pickMetadataValue(output.contentType, source.contentType), 128),
        byteSize: normalizeOptionalInteger(pickMetadataValue(output.byteSize, source.byteSize)),
        generatedAt: normalizeIsoTimestamp(pickMetadataValue(output.generatedAt, source.generatedAt)) || new Date().toISOString(),
      },
      workflow: {
        template: normalizeOptionalString(pickMetadataValue(workflow.template, source.workflowTemplate), 128) || DEFAULT_WORKFLOW_TEMPLATE,
        version: normalizeOptionalInteger(pickMetadataValue(workflow.version, source.workflowVersion)) || DEFAULT_WORKFLOW_VERSION,
      },
    };
  };

  return {
    DEFAULT_SERVICE_PROFILES,
    DEFAULT_RENDERER_ILLUSTRATOR_CONFIG,
    DEFAULT_WORKFLOW_TEMPLATE,
    DEFAULT_WORKFLOW_VERSION,
    classifyEndpointHost,
    createOutputFilename,
    createSceneExcerpt,
    createServiceProfileId,
    getIllustrationDisplayState,
    hashSceneText,
    normalizeIllustrationMetadata,
    normalizeRendererIllustratorConfig,
    normalizeSceneContext,
    normalizeServiceProfiles,
    updateSceneContextHistory,
  };
});
