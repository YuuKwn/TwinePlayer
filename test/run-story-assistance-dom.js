/* eslint-disable no-console */
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..');
const flutterRoot = path.join(repoRoot, 'flutter_app');
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'story-assistance-official');
const dartCandidates = [
  process.env.TWINEPLAYER_DART,
  'dart',
  'C:\\Users\\fabio\\development\\flutter\\bin\\cache\\dart-sdk\\bin\\dart.exe',
].filter(Boolean);

function readBridgeScript() {
  const tool = path.join('tool', 'print_twine_bridge.dart');
  for (const executable of dartCandidates) {
    const result = childProcess.spawnSync(executable, [tool], {
      cwd: flutterRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error('Unable to run the Dart bridge printer.');
}

const fixtures = [
  ['harlowe_cssselectors_example.html', 'harlowe'],
  ['sugarcube_cssselectors_example.html', 'sugarcube'],
  ['chapbook_cssselectors_example.html', 'chapbook'],
  ['snowman_cssselectors_example.html', 'snowman'],
];

const config = {
  enabled: true,
  textScale: 1.2,
  lineHeight: 1.8,
  paragraphSpacing: 1.5,
  readableLineLengthEnabled: true,
  readableLineLength: 70,
  targetSpacing: 1.4,
};

async function tick(page) {
  await page.waitForTimeout(20);
}

async function install(page, script) {
  await page.addScriptTag({ content: script });
  await tick(page);
}

async function exerciseFixture(page, script, fixture, expectedEngine) {
  await page.goto(pathToFileURL(path.join(fixtureRoot, fixture)).href, {
    waitUntil: 'load',
  });
  await install(page, script);
  const result = await page.evaluate(async ({ expectedEngine, config }) => {
    const detected = window.__twinePlayerDetectReadabilityEngine();
    if (!detected.verified || detected.engine !== expectedEngine) {
      throw new Error(`engine detection failed: ${JSON.stringify(detected)}`);
    }
    const root = detected.roots[0];
    const storyOwned = document.createElement('p');
    storyOwned.className = 'twine-player-readability-text-v2';
    storyOwned.setAttribute('data-twine-player-readability', 'story-owned');
    storyOwned.textContent = 'story-owned';
    root.appendChild(storyOwned);
    const excluded = document.createElement('div');
    excluded.setAttribute('contenteditable', 'true');
    const excludedText = document.createElement('p');
    excludedText.textContent = 'excluded';
    excluded.appendChild(excludedText);
    const canvas = document.createElement('canvas');
    canvas.width = 19;
    canvas.height = 11;
    root.appendChild(excluded);
    root.appendChild(canvas);
    const before = {
      fontSize: getComputedStyle(excludedText).fontSize,
      lineHeight: getComputedStyle(excludedText).lineHeight,
      width: getComputedStyle(canvas).width,
    };
    const applied = window.__twinePlayerSetStoryAssistance(config);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const style = document.getElementById('twine-player-story-assistance-v2');
    const rootClass = 'twine-player-readability-root-v2';
    const widthSuppressedInitially = !root.classList.contains(rootClass);
    root.removeChild(excluded);
    root.removeChild(canvas);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const widthRestoredAfterRemoval = root.classList.contains(rootClass);
    const dynamicCanvas = document.createElement('canvas');
    dynamicCanvas.width = 23;
    dynamicCanvas.height = 13;
    root.appendChild(dynamicCanvas);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const widthSuppressedDynamically = !root.classList.contains(rootClass);
    root.removeChild(dynamicCanvas);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const widthRestoredAfterDynamicRemoval = root.classList.contains(rootClass);
    root.appendChild(excluded);
    root.appendChild(canvas);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const widthSuppressedAfterReinsert = !root.classList.contains(rootClass);
    const dynamic = document.createElement('p');
    dynamic.textContent = 'dynamic passage content';
    root.appendChild(dynamic);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dynamicMarked = dynamic.hasAttribute('data-twine-player-readability');
    root.removeChild(dynamic);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dynamicRemoved = !dynamic.hasAttribute('data-twine-player-readability') &&
      !dynamic.classList.contains('twine-player-readability-text-v2');
    const after = {
      fontSize: getComputedStyle(excludedText).fontSize,
      lineHeight: getComputedStyle(excludedText).lineHeight,
      width: getComputedStyle(canvas).width,
    };
    const enabledStatus = window.__twinePlayerGetStoryAssistanceStatus();
    const css = style ? style.textContent : '';
    const scrollResult = window.__twinePlayerScrollStoryPage(1);
    const reset = window.__twinePlayerResetStoryAssistance();
    const teardown = {
      styleRemoved: !document.getElementById('twine-player-story-assistance-v2'),
      observerRemoved: window.__twinePlayerReadabilityObserver === null,
      ownedClassPreserved: storyOwned.classList.contains('twine-player-readability-text-v2'),
      ownedMarkerPreserved: storyOwned.getAttribute('data-twine-player-readability') === 'story-owned',
      excludedUnchanged: JSON.stringify(before) === JSON.stringify(after),
      widthSuppressedInitially,
      widthRestoredAfterRemoval,
      widthSuppressedDynamically,
      widthRestoredAfterDynamicRemoval,
      widthSuppressedAfterReinsert,
      noForbiddenCss: !/color\s*:|font-family|animation\s*:|transition\s*:/.test(css),
    };
    for (let index = 0; index < 5; index += 1) {
      window.__twinePlayerSetStoryAssistance(config);
      window.__twinePlayerResetStoryAssistance();
    }
    const soak = window.__twinePlayerGetStoryAssistanceStatus();
    return { detected, applied, enabledStatus, dynamicMarked, dynamicRemoved, teardown, reset, soak, scrollResult };
  }, { expectedEngine, config });
  if (result.enabledStatus.engine !== expectedEngine || !result.enabledStatus.enabled || !result.enabledStatus.stylePresent) {
    throw new Error(`${fixture}: enabled status failed ${JSON.stringify(result.enabledStatus)}`);
  }
  if (!result.dynamicMarked || !result.dynamicRemoved) throw new Error(`${fixture}: dynamic lifecycle failed`);
  if (!result.scrollResult || result.scrollResult.ok !== true) throw new Error(`${fixture}: page scroll bridge failed`);
  if (Object.values(result.teardown).some((value) => value !== true)) {
    throw new Error(`${fixture}: teardown/exclusion failed ${JSON.stringify(result.teardown)}`);
  }
  if (result.soak.stylePresent || result.soak.observerPresent || result.soak.markedCount !== 0) {
    throw new Error(`${fixture}: soak cleanup failed ${JSON.stringify(result.soak)}`);
  }
  await page.reload({ waitUntil: 'load' });
  await install(page, script);
  const reapplied = await page.evaluate((config) => window.__twinePlayerSetStoryAssistance(config), config);
  if (reapplied.engine !== expectedEngine || !reapplied.enabled) throw new Error(`${fixture}: reload reapply failed`);
  return { fixture, engine: expectedEngine, marked: result.enabledStatus.markedCount };
}

async function exerciseUnknown(page, script) {
  await page.setContent('<!doctype html><html><body><tw-story><tw-passage><p>Unknown story</p></tw-passage></tw-story></body></html>');
  await install(page, script);
  const status = await page.evaluate((config) => window.__twinePlayerSetStoryAssistance(config), config);
  if (status.engine !== 'unknown' || status.stylePresent || status.markedCount !== 0) {
    throw new Error(`unknown engine was mutated: ${JSON.stringify(status)}`);
  }
  return status;
}

async function exerciseSaveCapture(page, script) {
  await page.setContent('<!doctype html><html><body><p>Save capture test</p></body></html>');
  await install(page, script);
  const direct = await page.evaluate(() => {
    let diskCalls = 0;
    window.Save = {
      base64: { save: () => 'direct-current-state' },
      disk: { save: () => { diskCalls += 1; } },
    };
    const result = window.__twinePlayerCaptureSave();
    return { result, diskCalls };
  });
  if (direct.diskCalls !== 0 || direct.result.pending || direct.result.data !== 'direct-current-state' || direct.result.format !== 'sugarcube-base64') {
    throw new Error(`direct SugarCube Base64 capture failed: ${JSON.stringify(direct)}`);
  }

  const diskFallback = await page.evaluate(() => {
    let diskCalls = 0;
    window.Save = {
      base64: { save: () => { throw new Error('Base64 save is restricted'); } },
      disk: { save: () => { diskCalls += 1; } },
    };
    const result = window.__twinePlayerCaptureSave();
    return { result, diskCalls };
  });
  if (diskFallback.diskCalls !== 1 || !diskFallback.result.pending || diskFallback.result.method !== 'Save.disk.save') {
    throw new Error(`disk fallback capture failed: ${JSON.stringify(diskFallback)}`);
  }

  const allUnavailable = await page.evaluate(() => {
    window.Save = { base64: { save: () => null } };
    return window.__twinePlayerCaptureSave();
  });
  if (allUnavailable.ok || !/no save data|failed|unavailable/i.test(allUnavailable.error || '')) {
    throw new Error(`unavailable capture error was not useful: ${JSON.stringify(allUnavailable)}`);
  }

  await page.goto(pathToFileURL(path.join(fixtureRoot, 'sugarcube_cssselectors_example.html')).href, {
    waitUntil: 'load',
  });
  await install(page, script);
  const fixtureSetup = await page.evaluate(() => {
    const api = window.Save || (window.SugarCube && window.SugarCube.Save);
    if (!api) throw new Error('official SugarCube fixture did not expose Save');
    const hasDirectCapture = !!(api.base64 && typeof api.base64.save === 'function');
    if (hasDirectCapture) return { shimmed: false };
    // The checked-in Cookbook fixture is SugarCube 2.18, which predates the
    // Save.base64 API. Add a page-local adapter so the compiled fixture still
    // exercises TwinePlayer's direct-capture and load ordering without ever
    // modifying the source fixture on disk.
    const shimmedApi = Object.create(api);
    shimmedApi.base64 = {
      save: () => 'Zml4dHVyZS1jdXJyZW50LXN0YXRl',
      load: (value) => {
        window.__fixtureLoadedSave = String(value);
        return true;
      },
    };
    window.Save = shimmedApi;
    return { shimmed: true };
  });
  const fixtureCapture = await page.evaluate(async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (window.Save && (window.SugarCube || window.Save.base64)) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const capture = window.__twinePlayerCaptureSave();
    if (!capture || !capture.ok || capture.pending || !capture.data) return { capture };
    const restored = window.__twinePlayerRestoreSave(capture.data);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { capture, restored, loaded: window.__fixtureLoadedSave || null };
  });
  if (!fixtureCapture.capture || !fixtureCapture.capture.ok || fixtureCapture.capture.pending || !fixtureCapture.capture.data) {
    throw new Error(`official SugarCube fixture did not produce direct save data: ${JSON.stringify({ fixtureSetup, fixtureCapture })}`);
  }
  if (!fixtureCapture.restored || fixtureCapture.restored.ok !== true ||
      (fixtureSetup.shimmed && fixtureCapture.loaded !== String(fixtureCapture.capture.data))) {
    throw new Error(`official SugarCube fixture save did not restore: ${JSON.stringify({ fixtureSetup, fixtureCapture })}`);
  }
  return {
    direct: direct.result,
    diskFallback: diskFallback.result,
    fixture: {
      format: fixtureCapture.capture.format,
      dataLength: String(fixtureCapture.capture.data).length,
      restored: fixtureCapture.restored,
      shimmedForLegacyFixture: fixtureSetup.shimmed,
    },
  };
}

async function main() {
  const script = readBridgeScript();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const results = [];
    for (const [fixture, engine] of fixtures) {
      results.push(await exerciseFixture(page, script, fixture, engine));
    }
    const unknown = await exerciseUnknown(page, script);
    const saveCapture = await exerciseSaveCapture(page, script);
    console.log('PASS story assistance DOM runtime', JSON.stringify({ results, unknown, saveCapture }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`FAIL story assistance DOM runtime: ${error.stack || error}`);
  process.exitCode = 1;
});
