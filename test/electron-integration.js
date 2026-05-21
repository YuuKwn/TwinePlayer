const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { _electron: electron, expect } = require('@playwright/test');
const electronPath = require('electron');

const appRoot = path.resolve(__dirname, '..');
const fakeSugarCubeFixture = path.join(appRoot, 'test', 'fixtures', 'fake-sugarcube.html');
const minimalFixture = path.join(appRoot, 'test', 'fixtures', 'minimal-twine.html');

const isGpuLaunchError = (err) => /GPU process isn't usable/.test(String(err && (err.stack || err.message || err)));

const launchApp = async () => {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-software-rasterizer',
      appRoot,
    ],
    cwd: appRoot,
    env: {
      ...process.env,
      TWINEPLAYER_E2E: '1',
    },
  });

  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
};

const withApp = async (name, fn) => {
  let app;
  try {
    ({ app } = await launchApp());
    const page = await app.firstWindow();
    await fn({ app, page });
    console.log(`ok - ${name}`);
  } catch (err) {
    if (!isGpuLaunchError(err)) {
      console.error(`not ok - ${name}`);
    }
    throw err;
  } finally {
    if (app) {
      await app.close();
    }
  }
};

const mockOpenDialog = async (app, filePath) => {
  await app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedPath],
    });
  }, filePath);
};

const readRequestJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const sendJson = (res, body, statusCode = 200) => {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const withMockAiServices = async (options, fn) => {
  const state = {
    queuedPromptIds: [],
    queueCount: 0,
    historyCount: 0,
    ...options,
  };
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/api/tags') {
        sendJson(res, { models: [{ name: 'llama3.2' }] }, state.textListStatus || 200);
        return;
      }

      if (req.url === '/api/generate') {
        await readRequestJson(req);
        sendJson(res, { response: 'mock moonlit room, blue velvet chair' }, state.textStatus || 200);
        return;
      }

      if (req.url === '/v1/models') {
        sendJson(res, { data: [{ id: 'local-openai' }] });
        return;
      }

      if (req.url === '/v1/chat/completions') {
        await readRequestJson(req);
        sendJson(res, { choices: [{ message: { content: 'mock openai image prompt' } }] }, state.textStatus || 200);
        return;
      }

      if (req.url === '/object_info/CheckpointLoaderSimple') {
        sendJson(res, {
          CheckpointLoaderSimple: {
            input: {
              required: {
                ckpt_name: [['story.safetensors']],
              },
            },
          },
        }, state.comfyInfoStatus || 200);
        return;
      }

      if (req.url === '/prompt') {
        state.queueCount += 1;
        await readRequestJson(req);
        if (state.queueStatus && state.queueStatus >= 400) {
          sendJson(res, { error: 'queue failed' }, state.queueStatus);
          return;
        }
        const promptId = `mock-prompt-${state.queueCount}`;
        state.queuedPromptIds.push(promptId);
        sendJson(res, { prompt_id: promptId });
        return;
      }

      if (req.url && req.url.startsWith('/history/')) {
        state.historyCount += 1;
        const promptId = decodeURIComponent(req.url.split('/').pop());
        if (state.pendingForever || state.historyCount <= (state.pendingResponses || 0)) {
          sendJson(res, {});
          return;
        }
        sendJson(res, {
          [promptId]: {
            outputs: {
              7: {
                images: [
                  { filename: 'mock-output.png', subfolder: '', type: 'output' },
                ],
              },
            },
          },
        });
        return;
      }

      if (req.url && req.url.startsWith('/view')) {
        if (state.badImageContentType) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{}');
          return;
        }
        res.writeHead(200, { 'content-type': 'image/png' });
        res.end(imageBytes);
        return;
      }

      sendJson(res, { error: 'not found' }, 404);
    } catch (err) {
      sendJson(res, { error: err.message }, 500);
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`, state);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

const withTempFixture = async (sourceFixture, fn) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-ai-fixture-'));
  const fixturePath = path.join(tempDir, path.basename(sourceFixture));
  fs.copyFileSync(sourceFixture, fixturePath);
  try {
    return await fn(fixturePath, tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

const seedHistory = async (page, entries) => {
  await page.evaluate((historyEntries) => {
    localStorage.setItem('twine_player_history', JSON.stringify(historyEntries));
  }, entries);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
};

const openFixtureFromLibrary = async (app, page, fixturePath = fakeSugarCubeFixture) => {
  await mockOpenDialog(app, fixturePath);
  await page.getByRole('button', { name: 'Load Game' }).click();
  await expect(page.locator('#game-title')).toHaveText(/Fixture/);
  await expect(page.locator('#game-frame')).toHaveAttribute('src', /^file:/);
};

const goBackToLibrary = async (page) => {
  await page.getByRole('button', { name: /Library/ }).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#history-grid')).toContainText('Fixture');
};

const configureIllustrator = async (page, endpoint, overrides = {}) => {
  await page.evaluate(({ serviceEndpoint, configOverrides }) => {
    localStorage.setItem('twine_player_illustrator_config', JSON.stringify({
      textBackend: 'ollama',
      textEndpoint: serviceEndpoint,
      textModel: 'llama3.2',
      comfyEndpoint: serviceEndpoint,
      checkpoint: 'story.safetensors',
      imageWidth: 512,
      imageHeight: 512,
      aspectPreset: 'custom',
      seed: 123,
      batchSize: 1,
      maxPollingMs: 10000,
      ...configOverrides,
    }));
  }, { serviceEndpoint: endpoint, configOverrides: overrides });
};

const openIllustrator = async (page) => {
  await page.getByRole('button', { name: /Illustrate/ }).click();
  await expect(page.locator('#illustrator-modal-overlay')).toHaveClass(/active/);
  await expect(page.locator('#illus-status')).toBeVisible();
};

const generateMockPrompt = async (page) => {
  await page.locator('#illus-generate-prompt-btn').click();
  await expect(page.locator('#illus-prompt-text')).toHaveValue(/mock .*room|mock openai/i);
};

const tests = [
  ['launches with an empty library state', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Twine Player');
    await expect(page.locator('#history-grid')).toContainText('No games in your library yet');
    await expect(page.getByPlaceholder('Search library')).toBeVisible();
    await expect(page.locator('#library-sort')).toBeVisible();
  }],

  ['selects a fixture game and supports library search and sort', async ({ app, page }) => {
    await openFixtureFromLibrary(app, page, minimalFixture);
    await goBackToLibrary(page);

    await expect(page.locator('.history-title')).toHaveText('Minimal Fixture Story');
    await page.getByPlaceholder('Search library').fill('minimal');
    await expect(page.locator('#history-grid')).toContainText('Minimal Fixture Story');
    await page.getByPlaceholder('Search library').fill('missing query');
    await expect(page.locator('#history-grid')).toContainText('No games match your search.');
    await page.getByPlaceholder('Search library').fill('');
    await page.locator('#library-sort').selectOption('title');
    await expect(page.locator('.history-title')).toHaveText('Minimal Fixture Story');
  }],

  ['marks missing library entries and removes them', async ({ page }) => {
    const missingPath = path.join(os.tmpdir(), `twine-player-missing-${Date.now()}.html`);
    await seedHistory(page, [{
      path: missingPath,
      title: 'Missing Fixture',
      lastPlayed: new Date().toISOString(),
    }]);

    await expect(page.locator('.history-item.missing-game')).toContainText('Missing file');
    await page.getByRole('button', { name: /Remove Missing Fixture from Library/ }).click();
    await expect(page.locator('#history-grid')).toContainText('No games in your library yet');
  }],

  ['opens a fixture game and navigates back to the library', async ({ app, page }) => {
    await openFixtureFromLibrary(app, page, fakeSugarCubeFixture);
    await expect(page.locator('#game-frame').contentFrame().locator('#passage')).toHaveText('Initial fixture passage.');
    await goBackToLibrary(page);
  }],

  ['opens and closes the save modal by keyboard', async ({ app, page }) => {
    await openFixtureFromLibrary(app, page, fakeSugarCubeFixture);
    await expect(page.locator('#game-frame').contentFrame().locator('#passage')).toHaveText('Initial fixture passage.');
    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('#saves-modal-overlay')).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#saves-modal-overlay')).not.toHaveClass(/active/);
  }],

  ['creates, overwrites, loads, and deletes a save for a fixture game', async ({ app, page }) => {
    const saveLabel = `fixture-${Date.now()}`;
    const saveName = `${saveLabel}.save`;

    await openFixtureFromLibrary(app, page, fakeSugarCubeFixture);
    await expect(page.locator('#game-frame').contentFrame().locator('#passage')).toHaveText('Initial fixture passage.');

    await page.getByRole('button', { name: /Save/ }).click();
    await page.locator('.save-slot.empty').click();
    await page.locator('#new-save-input').fill(saveName);
    await page.locator('#new-save-confirm').click();
    await expect(page.locator('#saves-modal-overlay')).not.toHaveClass(/active/);

    await page.getByRole('button', { name: /Save/ }).click();
    const overwriteSlot = page.locator('.save-slot').filter({ hasText: saveLabel });
    await expect(overwriteSlot).toBeVisible();
    await overwriteSlot.click();
    await expect(page.locator('#save-confirm-overlay')).toBeVisible();
    await expect(page.locator('#save-confirm-cancel')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#save-confirm-overlay')).toBeHidden();
    await expect(page.locator('#saves-modal-overlay')).toHaveClass(/active/);
    assert.equal(await overwriteSlot.evaluate(el => document.activeElement === el), true);

    await overwriteSlot.click();
    await expect(page.locator('#save-confirm-overlay')).toBeVisible();
    await page.locator('#save-confirm-cancel').click();
    await expect(page.locator('#save-confirm-overlay')).toBeHidden();
    await expect(page.locator('#saves-modal-overlay')).toHaveClass(/active/);
    assert.equal(await overwriteSlot.evaluate(el => document.activeElement === el), true);

    await overwriteSlot.click();
    await expect(page.locator('#save-confirm-overlay')).toBeVisible();
    await page.locator('#save-confirm-accept').click();
    await expect(page.locator('#saves-modal-overlay')).not.toHaveClass(/active/);

    await page.getByRole('button', { name: /Load/ }).click();
    await page.locator('.save-slot').filter({ hasText: saveLabel }).click();
    await expect(page.locator('#game-frame').contentFrame().locator('#passage')).toHaveText('Restored fixture passage.');

    await page.getByRole('button', { name: /Load/ }).click();
    const saveSlot = page.locator('.save-slot').filter({ hasText: saveLabel });
    const deleteButton = saveSlot.locator('.slot-delete');
    await deleteButton.click({ force: true });
    await expect(page.locator('#save-confirm-overlay')).toBeVisible();
    await expect(page.locator('#save-confirm-cancel')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#save-confirm-overlay')).toBeHidden();
    await expect(saveSlot).toBeVisible();
    assert.equal(await deleteButton.evaluate(el => document.activeElement === el), true);

    await deleteButton.click({ force: true });
    await expect(page.locator('#save-confirm-overlay')).toBeVisible();
    await page.locator('#save-confirm-cancel').click();
    await expect(page.locator('#save-confirm-overlay')).toBeHidden();
    await expect(saveSlot).toBeVisible();
    assert.equal(await deleteButton.evaluate(el => document.activeElement === el), true);

    await deleteButton.click({ force: true });
    await expect(page.locator('#save-confirm-overlay')).toBeVisible();
    await page.locator('#save-confirm-accept').click();
    await expect(page.locator('#saves-grid')).toContainText('No saves found');
  }],

  ['generates an Illustrator image with mocked AI services', async ({ app, page }) => {
    await withMockAiServices({}, async (endpoint) => {
      await withTempFixture(fakeSugarCubeFixture, async (fixturePath, tempDir) => {
        await openFixtureFromLibrary(app, page, fixturePath);
        await configureIllustrator(page, endpoint);
        await openIllustrator(page);

        await expect(page.locator('#illus-scene-text')).toHaveValue(/Initial fixture passage/);
        await generateMockPrompt(page);
        await page.locator('#illus-generate-image-btn').click();
        await expect(page.locator('#illus-result-img')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#illustration-dock')).not.toHaveClass(/is-hidden/);
        await expect(page.locator('#illus-gallery-grid')).toContainText(/mock-output\.png|Start|mock/i);

        const metadataPath = path.join(tempDir, 'fake-sugarcube_illustrations', 'mock-output.png.json');
        assert.equal(fs.existsSync(metadataPath), true);
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        assert.equal(metadata.prompt.final, 'mock moonlit room, blue velvet chair');
        assert.equal(metadata.comfyUI.promptId, 'mock-prompt-1');
      });
    });
  }],

  ['shows Illustrator text backend failures from mocked services', async ({ app, page }) => {
    await withMockAiServices({ textStatus: 500 }, async (endpoint) => {
      await withTempFixture(fakeSugarCubeFixture, async (fixturePath) => {
        await openFixtureFromLibrary(app, page, fixturePath);
        await configureIllustrator(page, endpoint);
        await openIllustrator(page);

        await page.locator('#illus-generate-prompt-btn').click();
        await expect(page.locator('#illus-status')).toContainText(/Text backend error|HTTP 500/);
      });
    });
  }],

  ['shows Illustrator ComfyUI queue failures from mocked services', async ({ app, page }) => {
    await withMockAiServices({ queueStatus: 503 }, async (endpoint) => {
      await withTempFixture(fakeSugarCubeFixture, async (fixturePath) => {
        await openFixtureFromLibrary(app, page, fixturePath);
        await configureIllustrator(page, endpoint);
        await openIllustrator(page);

        await page.locator('#illus-prompt-text').fill('manual prompt for queue failure');
        await page.locator('#illus-generate-image-btn').click();
        await expect(page.locator('#illus-status')).toContainText(/Generation failed|HTTP 503/);
      });
    });
  }],

  ['shows Illustrator image download failures from mocked services', async ({ app, page }) => {
    await withMockAiServices({ badImageContentType: true }, async (endpoint) => {
      await withTempFixture(fakeSugarCubeFixture, async (fixturePath) => {
        await openFixtureFromLibrary(app, page, fixturePath);
        await configureIllustrator(page, endpoint);
        await openIllustrator(page);

        await page.locator('#illus-prompt-text').fill('manual prompt for bad image');
        await page.locator('#illus-generate-image-btn').click();
        await expect(page.locator('#illus-status')).toContainText(/Generation failed|Expected image response/, { timeout: 15000 });
      });
    });
  }],

  ['cancels a pending Illustrator job with mocked services', async ({ app, page }) => {
    await withMockAiServices({ pendingForever: true }, async (endpoint) => {
      await withTempFixture(fakeSugarCubeFixture, async (fixturePath) => {
        await openFixtureFromLibrary(app, page, fixturePath);
        await configureIllustrator(page, endpoint);
        await openIllustrator(page);

        await page.locator('#illus-prompt-text').fill('manual prompt for cancellation');
        await page.locator('#illus-generate-image-btn').click();
        await expect(page.locator('#illus-cancel-image-btn')).toBeVisible();
        await page.locator('#illus-cancel-image-btn').click();
        await expect(page.locator('#illus-status')).toContainText(/canceled/i);
      });
    });
  }],

  ['toggles developer console layout and pinned bar state', async ({ app, page }) => {
    await openFixtureFromLibrary(app, page, fakeSugarCubeFixture);
    await expect(page.locator('#game-frame').contentFrame().locator('#passage')).toHaveText('Initial fixture passage.');
    await page.getByRole('button', { name: /Console/ }).click();
    await expect(page.locator('#dev-console')).toHaveClass(/open/);

    await page.locator('#layout-toggle').click();
    await expect(page.locator('body')).toHaveClass(/console-side/);

    await page.locator('#pin-bar-btn').click();
    await expect(page.locator('body')).toHaveClass(/bar-pinned/);

    await page.locator('#close-console').click();
    await expect(page.locator('#dev-console')).not.toHaveClass(/open/);
  }],
];

(async () => {
  assert.ok(fs.existsSync(fakeSugarCubeFixture), 'Fake SugarCube fixture is missing');
  assert.ok(fs.existsSync(minimalFixture), 'Minimal Twine fixture is missing');

  for (const [name, fn] of tests) {
    await withApp(name, fn);
  }
})().catch((err) => {
  if (isGpuLaunchError(err)) {
    console.warn('Skipping Electron integration assertions because this environment cannot start the Electron GPU process.');
    console.warn(String(err && (err.message || err)));
    return;
  }

  console.error(err);
  process.exitCode = 1;
});
