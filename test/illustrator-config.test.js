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
    batchSize: 99,
    seed: 999999999999,
  });

  assert.equal(config.imageWidth, 256);
  assert.equal(config.imageHeight, 2048);
  assert.equal(config.steps, 150);
  assert.equal(config.cfg, 0);
  assert.equal(config.maxPollingMs, 10000);
  assert.equal(config.batchSize, 4);
  assert.equal(config.seed, 4294967295);
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

test('normalizeIllustratorConfig keeps workflow controls safe', () => {
  const config = normalizeIllustratorConfig({
    seed: '1234',
    batchSize: '2',
    aspectPreset: 'vn_background',
    workflowMode: 'custom',
    customWorkflowJson: '{"prompt":{}}',
  });

  assert.equal(config.seed, 1234);
  assert.equal(config.batchSize, 2);
  assert.equal(config.aspectPreset, 'vn_background');
  assert.equal(config.workflowMode, 'custom');
  assert.equal(config.customWorkflowJson, '{"prompt":{}}');
  assert.equal(normalizeIllustratorConfig({ seed: 'random' }).seed, 'random');
  assert.equal(normalizeIllustratorConfig({ aspectPreset: 'bad' }).aspectPreset, DEFAULT_ILLUSTRATOR_CONFIG.aspectPreset);
});
