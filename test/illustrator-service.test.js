const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  generatePrompt,
  listComfyUIModels,
  listTextModels,
  pollImage,
  queueComfyUI,
} = require('../src/main/illustrator-service');

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

test('queueComfyUI builds workflow from configured image settings', async () => {
  let requestBody;
  await withServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/prompt');
    requestBody = await readJsonBody(req);
    jsonResponse(res, { prompt_id: 'abc123' });
  }, async (endpoint) => {
    assert.equal(await queueComfyUI({
      imagePrompt: 'a quiet garden',
      outputFilename: 'chapter-one.png',
      checkpoint: 'story.safetensors',
      config: {
        comfyEndpoint: endpoint,
        imageWidth: 640,
        imageHeight: 768,
        sampler: 'dpmpp_2m',
        scheduler: 'karras',
        steps: 33,
        cfg: 8.5,
        negativePrompt: 'bad hands',
      },
    }), 'abc123');

    assert.equal(requestBody.prompt['1'].inputs.ckpt_name, 'story.safetensors');
    assert.equal(requestBody.prompt['3'].inputs.text, 'bad hands');
    assert.equal(requestBody.prompt['4'].inputs.width, 640);
    assert.equal(requestBody.prompt['4'].inputs.height, 768);
    assert.equal(requestBody.prompt['5'].inputs.sampler_name, 'dpmpp_2m');
    assert.equal(requestBody.prompt['5'].inputs.scheduler, 'karras');
    assert.equal(requestBody.prompt['5'].inputs.steps, 33);
    assert.equal(requestBody.prompt['5'].inputs.cfg, 8.5);
    assert.equal(requestBody.prompt['7'].inputs.filename_prefix, 'chapter-one');
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
        config: { comfyEndpoint: endpoint },
      });

      const outputDir = path.join(tempDir, 'Example Story_illustrations');
      const localPath = path.join(outputDir, 'chapter.png');
      const metadataPath = `${localPath}.json`;

      assert.equal(result.filename, 'chapter.png');
      assert.equal(result.localPath, localPath);
      assert.equal(result.dataUrl, `data:image/png;base64,${imageBytes.toString('base64')}`);
      assert.deepEqual([...fs.readFileSync(localPath)], [...imageBytes]);

      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      assert.equal(metadata.promptId, 'done');
      assert.equal(metadata.filename, 'chapter.png');
      assert.equal(metadata.contentType, 'image/png');
      assert.match(metadata.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
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
