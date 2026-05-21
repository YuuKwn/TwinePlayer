const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classifyEndpointHost,
  createOutputFilename,
  createSceneExcerpt,
  createServiceProfileId,
  getIllustrationDisplayState,
  hashSceneText,
  normalizeIllustrationMetadata,
  normalizeRendererIllustratorConfig,
  normalizeServiceProfiles,
} = require('../src/shared/illustrator-helpers');
const {
  normalizeIllustratorConfig,
} = require('../src/main/illustrator-config');

test('normalizeRendererIllustratorConfig matches main-process config for shared fields', () => {
  const input = {
    textBackend: 'openai',
    textEndpoint: 'http://127.0.0.1:8080/v1',
    textModel: ' local-mlx ',
    comfyEndpoint: 'http://127.0.0.1:8188',
    checkpoint: ' story.safetensors ',
    imageWidth: '9999',
    imageHeight: '32',
    sampler: ' dpmpp_2m ',
    scheduler: ' karras ',
    steps: '300',
    cfg: '8.5',
    negativePrompt: ' bad hands ',
    maxPollingMs: '5',
  };

  assert.deepEqual(
    normalizeRendererIllustratorConfig(input),
    normalizeIllustratorConfig(input)
  );
});

test('createOutputFilename returns stable plain PNG filenames', () => {
  assert.equal(
    createOutputFilename(new Date('2026-05-01T02:03:04.000Z'), 'Library: Night/Arrival'),
    'twineplayer_20260501T020304Z_library-night-arrival.png'
  );
  assert.match(createOutputFilename(0, '../bad'), /^twineplayer_19700101T000000Z_bad\.png$/);
});

test('hashSceneText and createSceneExcerpt are deterministic and bounded', () => {
  assert.equal(hashSceneText('  A moonlit room  '), hashSceneText('A moonlit room'));
  assert.notEqual(hashSceneText('A moonlit room'), hashSceneText('A sunlit room'));
  assert.equal(createSceneExcerpt(' A\n\nmoonlit\troom ', 20), 'A moonlit room');
  assert.equal(createSceneExcerpt('abcdef', 3), 'abc');
});

test('getIllustrationDisplayState covers primary generation states', () => {
  assert.deepEqual(getIllustrationDisplayState('idle', false), {
    status: 'idle',
    showSpinner: false,
    showPlaceholder: true,
    showImage: false,
    showDownload: false,
    showCancel: false,
    canGenerate: true,
  });
  assert.equal(getIllustrationDisplayState('working', true).showSpinner, true);
  assert.equal(getIllustrationDisplayState('working', true).showCancel, true);
  assert.equal(getIllustrationDisplayState('done', true).showImage, true);
  assert.equal(getIllustrationDisplayState('done', true).showDownload, true);
  assert.equal(getIllustrationDisplayState('error', false).showPlaceholder, true);
  assert.equal(getIllustrationDisplayState('canceled', true).showImage, true);
});

test('normalizeIllustrationMetadata handles rich and legacy sidecars', () => {
  const rich = normalizeIllustrationMetadata({
    game: { basename: 'Example.html' },
    passage: { identity: 'library-night', title: 'Library Night' },
    scene: { textExcerpt: 'Moonlit room', textHash: 'abc123' },
    prompt: { final: 'blue moonlight', generatedAt: '2026-05-01T12:00:00.000Z' },
    comfyUI: { promptId: 'done', seed: 12, endpointOrigin: 'http://127.0.0.1:8188/path' },
    output: { localFilename: 'chapter.png', byteSize: 4 },
  });

  assert.equal(rich.twinePlayerIllustrationVersion, 1);
  assert.equal(rich.game.basename, 'Example.html');
  assert.equal(rich.comfyUI.endpointOrigin, 'http://127.0.0.1:8188');
  assert.equal(rich.comfyUI.seed, 12);
  assert.equal(rich.output.localFilename, 'chapter.png');

  const legacy = normalizeIllustrationMetadata({
    promptId: 'old',
    filename: 'old.png',
    contentType: 'image/png',
  });
  assert.equal(legacy.comfyUI.promptId, 'old');
  assert.equal(legacy.output.localFilename, 'old.png');
  assert.equal(legacy.output.contentType, 'image/png');
});

test('classifyEndpointHost labels local LAN remote and invalid endpoints', () => {
  assert.deepEqual(classifyEndpointHost('http://localhost:11434'), { kind: 'local', label: 'Local' });
  assert.deepEqual(classifyEndpointHost('http://127.0.0.1:8188'), { kind: 'local', label: 'Local' });
  assert.deepEqual(classifyEndpointHost('http://192.168.1.20:8000/v1'), { kind: 'lan', label: 'LAN' });
  assert.deepEqual(classifyEndpointHost('http://10.0.0.4:8000/v1'), { kind: 'lan', label: 'LAN' });
  assert.deepEqual(classifyEndpointHost('https://example.com/v1'), { kind: 'remote', label: 'Remote' });
  assert.deepEqual(classifyEndpointHost('file:///tmp/model'), { kind: 'invalid', label: 'Invalid' });
});

test('normalizeServiceProfiles keeps defaults and repairs stored custom profiles', () => {
  const profiles = normalizeServiceProfiles({
    profiles: [
      null,
      { name: '', config: {} },
      {
        name: ' My Lab Profile ',
        id: 'My Lab Profile',
        config: {
          textBackend: 'openai',
          textEndpoint: 'http://10.0.0.8:8000/v1',
          textModel: 'local-model',
          comfyEndpoint: 'http://127.0.0.1:8188',
        },
      },
      {
        name: 'Duplicate default',
        id: 'local-ollama-local-comfyui',
        config: {},
      },
    ],
  });

  assert.equal(profiles[0].name, 'Local Ollama + Local ComfyUI');
  assert.equal(profiles[0].builtIn, true);
  assert.equal(profiles[1].name, 'LAN OpenAI-compatible + Local ComfyUI');
  assert.equal(profiles[2].id, 'my-lab-profile');
  assert.equal(profiles[2].builtIn, false);
  assert.equal(profiles[2].config.textBackend, 'openai');
  assert.equal(profiles[2].config.textEndpoint, 'http://10.0.0.8:8000/v1');
  assert.equal(profiles.length, 3);
});

test('createServiceProfileId creates stable plain identifiers', () => {
  assert.equal(createServiceProfileId('My Lab Profile', '123'), 'my-lab-profile-123');
  assert.equal(createServiceProfileId('../', ''), 'scene');
});
