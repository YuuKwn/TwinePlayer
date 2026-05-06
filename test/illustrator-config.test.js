const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_ILLUSTRATOR_CONFIG,
  normalizeIllustratorConfig,
} = require('../src/main/illustrator-config');

test('normalizeIllustratorConfig keeps OpenAI-compatible text backends', () => {
  const config = normalizeIllustratorConfig({
    textBackend: 'openai',
    textEndpoint: 'http://192.168.1.10:8080/v1/',
    textModel: 'local-model',
  });

  assert.equal(config.textBackend, 'openai');
  assert.equal(config.textEndpoint, 'http://192.168.1.10:8080/v1');
  assert.equal(config.textModel, 'local-model');
});

test('normalizeIllustratorConfig clamps numeric image settings', () => {
  const config = normalizeIllustratorConfig({
    imageWidth: 99,
    imageHeight: 9000,
    steps: 999,
    cfg: -1,
    maxPollingMs: 1,
  });

  assert.equal(config.imageWidth, 256);
  assert.equal(config.imageHeight, 2048);
  assert.equal(config.steps, 150);
  assert.equal(config.cfg, 0);
  assert.equal(config.maxPollingMs, 10000);
});

test('normalizeIllustratorConfig rejects non-http endpoints', () => {
  assert.throws(
    () => normalizeIllustratorConfig({ textEndpoint: 'file:///tmp/model' }),
    /http or https/
  );
});

test('normalizeIllustratorConfig falls back for invalid backend and empty text', () => {
  const config = normalizeIllustratorConfig({
    textBackend: 'bad',
    textModel: '',
    negativePrompt: '',
  });

  assert.equal(config.textBackend, DEFAULT_ILLUSTRATOR_CONFIG.textBackend);
  assert.equal(config.textModel, DEFAULT_ILLUSTRATOR_CONFIG.textModel);
  assert.equal(config.negativePrompt, DEFAULT_ILLUSTRATOR_CONFIG.negativePrompt);
});
