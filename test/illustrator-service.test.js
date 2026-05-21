const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  cancelIllustratorJob,
  checkIllustratorHealth,
  clearIllustratorJobsForTest,
  buildComfyUIWorkflow,
  createVisualPromptInstruction,
  getIllustratorJob,
  generatePrompt,
  ILLUSTRATOR_JOB_STATUSES,
  listComfyUIModels,
  listIllustratorJobs,
  listTextModels,
  normalizeIllustrationMetadata,
  pollImage,
  queueComfyUI,
  retryIllustratorJob,
  startIllustratorGeneration,
} = require('../src/main/illustrator-service');

const PROMPT_LABEL_PATTERNS = {
  vn_background: 'VN scene background',
  vn_character_cg: 'VN character CG',
  comic_panel: 'Comic panel',
  manga_panel: 'Manga panel',
  concept_art: 'Concept art',
};

test.afterEach(() => {
  clearIllustratorJobsForTest();
});

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const withServer = async (handler, fn) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    requests.push(req);
    try {
      await handler(req, res);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

const jsonResponse = (res, body, statusCode = 200) => {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

test('listTextModels reads Ollama model names', async () => {
  await withServer((req, res) => {
    assert.equal(req.url, '/api/tags');
    jsonResponse(res, {
      models: [
        { name: 'llama3.2' },
        { name: '' },
        { name: 'mistral' },
      ],
    });
  }, async (endpoint) => {
    assert.deepEqual(await listTextModels({ textEndpoint: endpoint }), ['llama3.2', 'mistral']);
  });
});

test('listTextModels reads OpenAI-compatible model ids', async () => {
  await withServer((req, res) => {
    assert.equal(req.url, '/v1/models');
    jsonResponse(res, {
      data: [
        { id: 'mlx-community/model' },
        { id: '' },
        { id: 'llama.cpp-local' },
      ],
    });
  }, async (endpoint) => {
    assert.deepEqual(
      await listTextModels({ textBackend: 'openai', textEndpoint: `${endpoint}/v1` }),
      ['mlx-community/model', 'llama.cpp-local']
    );
  });
});

test('generatePrompt posts to OpenAI-compatible chat completions', async () => {
  let requestBody;
  await withServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/chat/completions');
    requestBody = await readJsonBody(req);
    jsonResponse(res, {
      choices: [
        { message: { content: ' moonlit library, blue dust, old velvet chair ' } },
      ],
    });
  }, async (endpoint) => {
    const prompt = await generatePrompt('A library at midnight.', 'local-mlx', {
      textBackend: 'openai',
      textEndpoint: `${endpoint}/v1`,
      textModel: 'fallback-model',
    });

    assert.equal(prompt, 'moonlit library, blue dust, old velvet chair');
    assert.equal(requestBody.model, 'local-mlx');
    assert.equal(requestBody.stream, false);
    assert.equal(requestBody.messages.length, 2);
    assert.match(requestBody.messages[1].content, /A library at midnight/);
  });
});

test('generatePrompt rejects malformed OpenAI-compatible responses', async () => {
  await withServer((req, res) => {
    jsonResponse(res, { choices: [] });
  }, async (endpoint) => {
    await assert.rejects(
      () => generatePrompt('Scene text', 'local-model', {
        textBackend: 'openai',
        textEndpoint: `${endpoint}/v1`,
      }),
      /choices\[0\]\.message\.content/
    );
  });
});

test('createVisualPromptInstruction includes style bible and character memory', () => {
  const instruction = createVisualPromptInstruction('A detective enters the rain-soaked arcade.', {
    mode: 'comic_panel',
    styleBible: 'neon noir, saturated reflections',
    characterNotes: 'Mira: red coat, tired eyes',
    worldNotes: 'The city is built over old canals.',
    promptTone: 'punchy, visual, concrete',
    recentContext: 'Mira found a broken token.',
  });

  assert.match(instruction, /Template mode: Comic panel/);
  assert.match(instruction, /neon noir/);
  assert.match(instruction, /Mira: red coat/);
  assert.match(instruction, /old canals/);
  assert.match(instruction, /broken token/);
  assert.match(instruction, /Avoid speech bubbles/);
});

test('createVisualPromptInstruction rejects oversized structured prompt context', () => {
  assert.throws(
    () => createVisualPromptInstruction('Scene', { styleBible: 'x'.repeat(4001) }),
    /Style bible is too long/
  );
  assert.throws(
    () => createVisualPromptInstruction('Scene', { recentContext: 'x'.repeat(4001) }),
    /Recent scene context is too long/
  );
});

test('createVisualPromptInstruction creates distinguishable mode instructions', () => {
  const scene = 'A hero watches the harbor.';
  const modes = ['vn_background', 'vn_character_cg', 'comic_panel', 'manga_panel', 'concept_art'];
  const instructions = modes.map(mode => createVisualPromptInstruction(scene, { mode }));

  modes.forEach((mode, index) => {
    assert.match(instructions[index], new RegExp(PROMPT_LABEL_PATTERNS[mode]));
  });
  assert.equal(new Set(instructions).size, modes.length);
});

test('listComfyUIModels reads checkpoint names', async () => {
  await withServer((req, res) => {
    assert.equal(req.url, '/object_info/CheckpointLoaderSimple');
    jsonResponse(res, {
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [['a.safetensors', 'b.safetensors']],
          },
        },
      },
    });
  }, async (endpoint) => {
    assert.deepEqual(await listComfyUIModels({ comfyEndpoint: endpoint }), ['a.safetensors', 'b.safetensors']);
  });
});

test('checkIllustratorHealth reports reachable selected Ollama and ComfyUI models', async () => {
  await withServer((req, res) => {
    if (req.url === '/api/tags') {
      jsonResponse(res, { models: [{ name: 'llama3.2' }] });
      return;
    }

    assert.equal(req.url, '/object_info/CheckpointLoaderSimple');
    jsonResponse(res, {
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [['story.safetensors']],
          },
        },
      },
    });
  }, async (endpoint) => {
    const health = await checkIllustratorHealth({
      textEndpoint: endpoint,
      textModel: 'llama3.2',
      comfyEndpoint: endpoint,
      checkpoint: 'story.safetensors',
    });

    assert.match(health.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(health.text.status, 'ok');
    assert.equal(health.text.reachable, true);
    assert.equal(health.text.modelAvailable, true);
    assert.equal(health.text.modelCount, 1);
    assert.equal(health.comfyUI.status, 'ok');
    assert.equal(health.comfyUI.reachable, true);
    assert.equal(health.comfyUI.checkpointAvailable, true);
    assert.equal(health.comfyUI.checkpointCount, 1);
  });
});

test('checkIllustratorHealth reports OpenAI-compatible missing model and checkpoint', async () => {
  await withServer((req, res) => {
    if (req.url === '/v1/models') {
      jsonResponse(res, { data: [{ id: 'other-model' }] });
      return;
    }

    assert.equal(req.url, '/object_info/CheckpointLoaderSimple');
    jsonResponse(res, {
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [['other.safetensors']],
          },
        },
      },
    });
  }, async (endpoint) => {
    const health = await checkIllustratorHealth({
      textBackend: 'openai',
      textEndpoint: `${endpoint}/v1`,
      textModel: 'wanted-model',
      comfyEndpoint: endpoint,
      checkpoint: 'wanted.safetensors',
    });

    assert.equal(health.text.backend, 'openai');
    assert.equal(health.text.status, 'missing_model');
    assert.equal(health.text.reachable, true);
    assert.equal(health.text.modelAvailable, false);
    assert.equal(health.comfyUI.status, 'missing_checkpoint');
    assert.equal(health.comfyUI.reachable, true);
    assert.equal(health.comfyUI.checkpointAvailable, false);
  });
});

test('checkIllustratorHealth returns structured unreachable statuses', async () => {
  await withServer((req, res) => {
    jsonResponse(res, { error: 'down' }, 503);
  }, async (endpoint) => {
    const health = await checkIllustratorHealth({
      textEndpoint: endpoint,
      comfyEndpoint: endpoint,
    });

    assert.equal(health.text.status, 'unreachable');
    assert.equal(health.text.reachable, false);
    assert.match(health.text.error, /HTTP 503/);
    assert.equal(health.comfyUI.status, 'unreachable');
    assert.equal(health.comfyUI.reachable, false);
    assert.match(health.comfyUI.error, /HTTP 503/);
  });
});

test('buildComfyUIWorkflow handles deterministic seed, batch, and aspect presets', () => {
  const built = buildComfyUIWorkflow({
    imagePrompt: 'a quiet garden',
    outputFilename: 'chapter-one.png',
    checkpoint: 'story.safetensors',
    config: {
      seed: 1234,
      batchSize: 3,
      aspectPreset: 'vn_background',
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
    },
  });

  assert.equal(built.seed, 1234);
  assert.equal(built.width, 1344);
  assert.equal(built.height, 768);
  assert.equal(built.workflowTemplate, 'comfyui-default-txt2img');
  assert.equal(built.workflow['4'].inputs.batch_size, 3);
  assert.equal(built.workflow['4'].inputs.width, 1344);
  assert.equal(built.workflow['4'].inputs.height, 768);
  assert.equal(built.workflow['5'].inputs.seed, 1234);
});

test('buildComfyUIWorkflow randomizes seed when requested', () => {
  const built = buildComfyUIWorkflow({
    imagePrompt: 'a quiet garden',
    outputFilename: 'chapter-one.png',
    checkpoint: 'story.safetensors',
    config: { seed: 'random' },
  });

  assert.equal(Number.isInteger(built.seed), true);
  assert.equal(built.seed >= 0, true);
  assert.equal(built.seed < 1e9, true);
});

test('buildComfyUIWorkflow replaces custom workflow placeholders', () => {
  const customWorkflowJson = JSON.stringify({
    "1": { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '{{checkpoint}}' } },
    "2": { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}' } },
    "3": { class_type: 'CLIPTextEncode', inputs: { text: '{{negative_prompt}}' } },
    "4": { class_type: 'EmptyLatentImage', inputs: { width: '{{width}}', height: '{{height}}', batch_size: '{{batch_size}}' } },
    "5": { class_type: 'KSampler', inputs: { seed: '{{seed}}' } },
    "6": { class_type: 'SaveImage', inputs: { filename_prefix: '{{output_prefix}}' } },
  });

  const built = buildComfyUIWorkflow({
    imagePrompt: 'a quiet garden',
    outputFilename: 'chapter-one.png',
    checkpoint: 'story.safetensors',
    config: {
      workflowMode: 'custom',
      customWorkflowJson,
      seed: 99,
      batchSize: 2,
      aspectPreset: 'square',
      negativePrompt: 'bad hands',
    },
  });

  assert.equal(built.workflowTemplate, 'comfyui-custom-workflow');
  assert.equal(built.workflow['1'].inputs.ckpt_name, 'story.safetensors');
  assert.equal(built.workflow['2'].inputs.text, 'a quiet garden');
  assert.equal(built.workflow['3'].inputs.text, 'bad hands');
  assert.equal(built.workflow['4'].inputs.width, 1024);
  assert.equal(built.workflow['4'].inputs.height, 1024);
  assert.equal(built.workflow['4'].inputs.batch_size, 2);
  assert.equal(built.workflow['5'].inputs.seed, 99);
  assert.equal(built.workflow['6'].inputs.filename_prefix, 'chapter-one');
});

test('buildComfyUIWorkflow rejects invalid custom workflows clearly', () => {
  assert.throws(
    () => buildComfyUIWorkflow({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: { workflowMode: 'custom', customWorkflowJson: '{"1":{"class_type":"SaveImage","inputs":{}}}' },
    }),
    /prompt text node/
  );
  assert.throws(
    () => buildComfyUIWorkflow({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: { workflowMode: 'custom', customWorkflowJson: '{"1":{"class_type":"CLIPTextEncode","inputs":{"text":"{{prompt}}"}}}' },
    }),
    /SaveImage output node/
  );
});

test('queueComfyUI builds workflow from configured image settings', async () => {
  let requestBody;
  await withServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/prompt');
    requestBody = await readJsonBody(req);
    jsonResponse(res, { prompt_id: 'abc123' });
  }, async (endpoint) => {
    const result = await queueComfyUI({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: {
        comfyEndpoint: endpoint,
        imageWidth: 640,
        imageHeight: 768,
        aspectPreset: 'custom',
        seed: 42,
        sampler: 'dpmpp_2m',
        scheduler: 'karras',
        steps: 33,
        cfg: 8.5,
        negativePrompt: 'bad hands',
      },
    });

    assert.equal(result.promptId, 'abc123');
    assert.equal(result.seed, 42);
    assert.equal(result.width, 640);
    assert.equal(result.height, 768);
    assert.equal(result.workflowTemplate, 'comfyui-default-txt2img');
    assert.equal(result.workflowVersion, 1);
    assert.equal(requestBody.prompt['1'].inputs.ckpt_name, 'story.safetensors');
    assert.equal(requestBody.prompt['3'].inputs.text, 'bad hands');
    assert.equal(requestBody.prompt['4'].inputs.width, 640);
    assert.equal(requestBody.prompt['4'].inputs.height, 768);
    assert.equal(requestBody.prompt['5'].inputs.sampler_name, 'dpmpp_2m');
    assert.equal(requestBody.prompt['5'].inputs.scheduler, 'karras');
    assert.equal(requestBody.prompt['5'].inputs.seed, result.seed);
    assert.equal(requestBody.prompt['5'].inputs.steps, 33);
    assert.equal(requestBody.prompt['5'].inputs.cfg, 8.5);
    assert.equal(requestBody.prompt['7'].inputs.filename_prefix, 'chapter-one');
  });
});

test('startIllustratorGeneration creates a durable job record', async () => {
  await withServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/prompt');
    jsonResponse(res, { prompt_id: 'job-create' });
  }, async (endpoint) => {
    const job = await startIllustratorGeneration({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: { comfyEndpoint: endpoint, seed: 123 },
      metadata: { sourceSceneText: 'A quiet garden.' },
    });

    assert.equal(job.status, ILLUSTRATOR_JOB_STATUSES.POLLING);
    assert.equal(job.promptId, 'job-create');
    assert.equal(job.prompt.imagePrompt, 'a quiet garden');
    assert.equal(job.prompt.outputFilename, 'chapter-one.png');
    assert.equal(job.config.seed, 123);
    assert.equal(job.metadata.sourceSceneText, 'A quiet garden.');
    assert.match(job.jobId, /^[0-9a-f-]{36}$/);

    const jobs = listIllustratorJobs();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].jobId, job.jobId);
    assert.equal(jobs[0].output, null);
  });
});

test('getIllustratorJob transitions pending jobs to completed', async () => {
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  let historyCalls = 0;

  await withServer(async (req, res) => {
    if (req.url === '/prompt') {
      jsonResponse(res, { prompt_id: 'job-done' });
      return;
    }

    if (req.url === '/history/job-done') {
      historyCalls += 1;
      if (historyCalls === 1) {
        jsonResponse(res, {});
        return;
      }

      jsonResponse(res, {
        'job-done': {
          outputs: {
            7: {
              images: [
                { filename: 'chapter.png', subfolder: '', type: 'output' },
              ],
            },
          },
        },
      });
      return;
    }

    assert.equal(req.url, '/view?filename=chapter.png&subfolder=&type=output');
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(imageBytes);
  }, async (endpoint) => {
    const started = await startIllustratorGeneration({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: { comfyEndpoint: endpoint, seed: 123 },
    });

    const pending = await getIllustratorJob(started.jobId);
    assert.equal(pending.status, ILLUSTRATOR_JOB_STATUSES.POLLING);
    assert.equal(pending.output, null);

    const completed = await getIllustratorJob(started.jobId);
    assert.equal(completed.status, ILLUSTRATOR_JOB_STATUSES.COMPLETED);
    assert.equal(completed.output.filename, 'chapter.png');
    assert.equal(completed.output.dataUrl, `data:image/png;base64,${imageBytes.toString('base64')}`);
    assert.match(completed.timestamps.completedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test('getIllustratorJob transitions expired active jobs to timed_out', async () => {
  await withServer((req, res) => {
    assert.equal(req.url, '/prompt');
    jsonResponse(res, { prompt_id: 'job-timeout' });
  }, async (endpoint) => {
    const started = await startIllustratorGeneration({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: { comfyEndpoint: endpoint, maxPollingMs: 10000 },
    });
    const futureMs = Date.parse(started.timestamps.pollingStartedAt) + 10001;
    const timedOut = await getIllustratorJob(started.jobId, { timestampMs: futureMs });

    assert.equal(timedOut.status, ILLUSTRATOR_JOB_STATUSES.TIMED_OUT);
    assert.match(timedOut.lastError, /timed out/);
    assert.match(timedOut.timestamps.timedOutAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test('cancelIllustratorJob stops local polling and marks the job canceled', async () => {
  await withServer((req, res) => {
    assert.equal(req.url, '/prompt');
    jsonResponse(res, { prompt_id: 'job-cancel' });
  }, async (endpoint) => {
    const started = await startIllustratorGeneration({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: { comfyEndpoint: endpoint },
    });

    const canceled = cancelIllustratorJob(started.jobId);
    assert.equal(canceled.status, ILLUSTRATOR_JOB_STATUSES.CANCELED);
    assert.match(canceled.timestamps.canceledAt, /^\d{4}-\d{2}-\d{2}T/);

    const lookedUp = await getIllustratorJob(started.jobId);
    assert.equal(lookedUp.status, ILLUSTRATOR_JOB_STATUSES.CANCELED);
  });
});

test('retryIllustratorJob starts a new job from a timed out job snapshot', async () => {
  const promptIds = ['job-original', 'job-retry'];

  await withServer((req, res) => {
    assert.equal(req.url, '/prompt');
    jsonResponse(res, { prompt_id: promptIds.shift() });
  }, async (endpoint) => {
    const started = await startIllustratorGeneration({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: { comfyEndpoint: endpoint, seed: 456, maxPollingMs: 10000 },
      metadata: { passageTitle: 'Garden' },
    });
    const futureMs = Date.parse(started.timestamps.pollingStartedAt) + 10001;
    const timedOut = await getIllustratorJob(started.jobId, { timestampMs: futureMs });
    assert.equal(timedOut.status, ILLUSTRATOR_JOB_STATUSES.TIMED_OUT);

    const retry = await retryIllustratorJob(started.jobId);
    assert.notEqual(retry.jobId, started.jobId);
    assert.equal(retry.retryOfJobId, started.jobId);
    assert.equal(retry.promptId, 'job-retry');
    assert.equal(retry.prompt.imagePrompt, started.prompt.imagePrompt);
    assert.equal(retry.prompt.outputFilename, started.prompt.outputFilename);
    assert.equal(retry.config.seed, 456);
    assert.equal(retry.metadata.passageTitle, 'Garden');
  });
});

test('pollImage returns pending when history entry is missing', async () => {
  await withServer((req, res) => {
    assert.equal(req.url, '/history/waiting');
    jsonResponse(res, {});
  }, async (endpoint) => {
    assert.deepEqual(await pollImage({
      promptId: 'waiting',
      config: { comfyEndpoint: endpoint },
    }), { pending: true });
  });
});

test('pollImage downloads image and writes local metadata sidecar', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-illus-'));
  try {
    const gamePath = path.join(tempDir, 'Example Story.html');
    fs.writeFileSync(gamePath, '<html></html>');
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    await withServer((req, res) => {
      if (req.url === '/history/done') {
        jsonResponse(res, {
          done: {
            outputs: {
              7: {
                images: [
                  { filename: 'chapter.png', subfolder: '', type: 'output' },
                ],
              },
            },
          },
        });
        return;
      }

      assert.equal(req.url, '/view?filename=chapter.png&subfolder=&type=output');
      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(imageBytes);
    }, async (endpoint) => {
      const result = await pollImage({
        promptId: 'done',
        gamePath,
        config: {
          textBackend: 'openai',
          textEndpoint: `${endpoint}/v1`,
          textModel: 'local-mlx',
          comfyEndpoint: endpoint,
          checkpoint: 'story.safetensors',
          imageWidth: 640,
          imageHeight: 768,
          sampler: 'dpmpp_2m',
          scheduler: 'karras',
          steps: 33,
          cfg: 8.5,
          negativePrompt: 'bad hands',
        },
        metadata: {
          sourceSceneText: 'A moonlit library with a velvet chair and blue dust.',
          imagePrompt: 'moonlit library, blue dust, old velvet chair',
          promptTemplateMode: 'vn_background',
          promptGeneratedAt: '2026-05-01T12:00:00.000Z',
          documentTitle: 'Example Story',
          passageIdentity: 'library-night',
          passageTitle: 'Library at Night',
          checkpoint: 'story.safetensors',
          seed: 123456,
          workflowTemplate: 'comfyui-default-txt2img',
          workflowVersion: 1,
        },
      });

      const outputDir = path.join(tempDir, 'Example Story_illustrations');
      const localPath = path.join(outputDir, 'chapter.png');
      const metadataPath = `${localPath}.json`;

      assert.equal(result.filename, 'chapter.png');
      assert.equal(result.localPath, localPath);
      assert.equal(result.dataUrl, `data:image/png;base64,${imageBytes.toString('base64')}`);
      assert.deepEqual([...fs.readFileSync(localPath)], [...imageBytes]);

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      assert.equal(result.metadataPath, metadataPath);
      assert.deepEqual(result.metadata, metadata);
      assert.equal(metadata.twinePlayerIllustrationVersion, 1);
      assert.equal(metadata.game.basename, 'Example Story.html');
      assert.equal(metadata.passage.identity, 'library-night');
      assert.equal(metadata.passage.title, 'Library at Night');
      assert.equal(metadata.scene.documentTitle, 'Example Story');
      assert.equal(metadata.scene.textExcerpt, 'A moonlit library with a velvet chair and blue dust.');
      assert.match(metadata.scene.textHash, /^[a-f0-9]{64}$/);
      assert.equal(metadata.prompt.final, 'moonlit library, blue dust, old velvet chair');
      assert.equal(metadata.prompt.negative, 'bad hands');
      assert.equal(metadata.prompt.templateMode, 'vn_background');
      assert.equal(metadata.prompt.textBackend, 'openai');
      assert.equal(metadata.prompt.textModel, 'local-mlx');
      assert.equal(metadata.prompt.generatedAt, '2026-05-01T12:00:00.000Z');
      assert.equal(metadata.comfyUI.endpointOrigin, endpoint);
      assert.equal(metadata.comfyUI.checkpoint, 'story.safetensors');
      assert.equal(metadata.comfyUI.width, 640);
      assert.equal(metadata.comfyUI.height, 768);
      assert.equal(metadata.comfyUI.sampler, 'dpmpp_2m');
      assert.equal(metadata.comfyUI.scheduler, 'karras');
      assert.equal(metadata.comfyUI.steps, 33);
      assert.equal(metadata.comfyUI.cfg, 8.5);
      assert.equal(metadata.comfyUI.seed, 123456);
      assert.equal(metadata.comfyUI.promptId, 'done');
      assert.equal(metadata.comfyUI.sourceOutputFilename, 'chapter.png');
      assert.equal(metadata.output.localFilename, 'chapter.png');
      assert.equal(metadata.output.contentType, 'image/png');
      assert.equal(metadata.output.byteSize, imageBytes.length);
      assert.match(metadata.output.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(metadata.workflow.template, 'comfyui-default-txt2img');
      assert.equal(metadata.workflow.version, 1);
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('normalizeIllustrationMetadata tolerates old minimal sidecars', () => {
  const normalized = normalizeIllustrationMetadata({
    promptId: 'done',
    filename: 'chapter.png',
    contentType: 'image/png',
    generatedAt: '2026-05-01T12:00:00.000Z',
  });

  assert.equal(normalized.twinePlayerIllustrationVersion, 1);
  assert.equal(normalized.comfyUI.promptId, 'done');
  assert.equal(normalized.comfyUI.sourceOutputFilename, 'chapter.png');
  assert.equal(normalized.output.localFilename, 'chapter.png');
  assert.equal(normalized.output.contentType, 'image/png');
  assert.equal(normalized.output.generatedAt, '2026-05-01T12:00:00.000Z');
  assert.equal(normalized.workflow.template, 'comfyui-default-txt2img');
});

test('normalizeIllustrationMetadata bounds user strings as JSON text', () => {
  const longPrompt = `<script>${'x'.repeat(6000)}</script>`;
  const longScene = `<b>${'scene '.repeat(1000)}</b>`;
  const normalized = normalizeIllustrationMetadata({
    imagePrompt: longPrompt,
    negativePrompt: '<img src=x onerror=alert(1)>'.repeat(300),
    sceneTextExcerpt: longScene,
    passageTitle: '<strong>Library</strong>',
  });

  assert.equal(typeof normalized.prompt.final, 'string');
  assert.equal(normalized.prompt.final.length, 5000);
  assert.match(normalized.prompt.final, /^<script>/);
  assert.equal(typeof normalized.prompt.negative, 'string');
  assert.equal(normalized.prompt.negative.length, 5000);
  assert.equal(normalized.scene.textExcerpt.length, 2000);
  assert.equal(normalized.passage.title, '<strong>Library</strong>');
});

test('metadata write failure does not hide a successfully copied image', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-illus-'));
  try {
    const gamePath = path.join(tempDir, 'Example Story.html');
    fs.writeFileSync(gamePath, '<html></html>');
    const outputDir = path.join(tempDir, 'Example Story_illustrations');
    const localPath = path.join(outputDir, 'chapter.png');
    fs.mkdirSync(`${localPath}.json`, { recursive: true });
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    await withServer((req, res) => {
      if (req.url === '/history/done') {
        jsonResponse(res, {
          done: {
            outputs: {
              7: {
                images: [
                  { filename: 'chapter.png', subfolder: '', type: 'output' },
                ],
              },
            },
          },
        });
        return;
      }

      res.writeHead(200, { 'content-type': 'image/png' });
      res.end(imageBytes);
    }, async (endpoint) => {
      const originalConsoleWarn = console.warn;
      console.warn = () => {};
      try {
        const result = await pollImage({
          promptId: 'done',
          gamePath,
          config: { comfyEndpoint: endpoint },
          metadata: { imagePrompt: '<script>alert(1)</script>' },
        });

        assert.equal(result.filename, 'chapter.png');
        assert.equal(result.localPath, localPath);
        assert.equal(result.metadataPath, null);
        assert.equal(result.metadata.prompt.final, '<script>alert(1)</script>');
        assert.deepEqual([...fs.readFileSync(localPath)], [...imageBytes]);
        assert.equal(fs.statSync(`${localPath}.json`).isDirectory(), true);
      } finally {
        console.warn = originalConsoleWarn;
      }
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('pollImage rejects non-image responses', async () => {
  await withServer((req, res) => {
    if (req.url === '/history/done') {
      jsonResponse(res, {
        done: {
          outputs: {
            7: {
              images: [
                { filename: 'chapter.png', subfolder: '', type: 'output' },
              ],
            },
          },
        },
      });
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  }, async (endpoint) => {
    await assert.rejects(
      () => pollImage({
        promptId: 'done',
        config: { comfyEndpoint: endpoint },
      }),
      /Expected image response/
    );
  });
});
