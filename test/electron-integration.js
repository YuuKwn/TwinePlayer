const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    await openFixtureFromLibrary(app, page, fakeSugarCubeFixture);
    await expect(page.locator('#game-frame').contentFrame().locator('#passage')).toHaveText('Initial fixture passage.');

    await page.getByRole('button', { name: /Save/ }).click();
    await page.locator('.save-slot.empty').click();
    await page.locator('#new-save-input').fill('fixture.save');
    await page.locator('#new-save-confirm').click();
    await expect(page.locator('#saves-modal-overlay')).not.toHaveClass(/active/);

    await page.getByRole('button', { name: /Save/ }).click();
    await expect(page.locator('.save-slot').filter({ hasText: 'fixture' })).toBeVisible();
    await page.locator('.save-slot').filter({ hasText: 'fixture' }).click();
    await expect(page.locator('#save-confirm-overlay')).toBeVisible();
    await page.locator('#save-confirm-accept').click();
    await expect(page.locator('#saves-modal-overlay')).not.toHaveClass(/active/);

    await page.getByRole('button', { name: /Load/ }).click();
    await page.locator('.save-slot').filter({ hasText: 'fixture' }).click();
    await expect(page.locator('#game-frame').contentFrame().locator('#passage')).toHaveText('Restored fixture passage.');

    await page.getByRole('button', { name: /Load/ }).click();
    const saveSlot = page.locator('.save-slot').filter({ hasText: 'fixture' });
    await saveSlot.locator('.slot-delete').click({ force: true });
    await page.locator('#save-confirm-accept').click();
    await expect(page.locator('#saves-grid')).toContainText('No saves found');
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
