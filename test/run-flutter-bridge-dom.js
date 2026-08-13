/* eslint-disable no-console */
const childProcess = require('node:child_process');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const repoRoot = path.resolve(__dirname, '..');
const flutterRoot = path.join(repoRoot, 'flutter_app');
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
  throw new Error(
    'Unable to run the Dart bridge printer. Set TWINEPLAYER_DART or run flutter pub get first.',
  );
}

async function main() {
  const script = readBridgeScript();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><head><title>DOM fixture</title></head><body><button id="story-button" class="story-owned">Story choice</button><div id="root"></div></body></html>');
    await page.evaluate(() => {
      window.__twinePlayerMessages = [];
      window.chrome = window.chrome || {};
      window.chrome.webview = {
        postMessage(value) {
          window.__twinePlayerMessages.push(String(value));
        },
      };
    });
    await page.addScriptTag({ content: script });

    const initial = await page.evaluate(() => ({
      diagnostics: window.__twinePlayerDiagnosticsEnabled,
      messages: window.__twinePlayerMessages.length,
    }));
    if (initial.diagnostics !== false) throw new Error('diagnostics defaulted on');
    await page.evaluate(() => {
      document.getElementById('story-button').click();
    });
    const disabledMessages = await page.evaluate(() =>
      window.__twinePlayerMessages.filter((value) => value.includes('input-diagnostic')).length,
    );
    if (disabledMessages !== 0) throw new Error('disabled diagnostics emitted a message');

    const result = await page.evaluate(async () => {
      const root = document.getElementById('root');
      const storyButton = document.getElementById('story-button');
      storyButton.style.width = '123px';
      window.__twinePlayerSetDiagnosticsEnabled(true);
      window.__twinePlayerSetEnhancedChoices(true);
      const styleCountOn = document.querySelectorAll('#twine-player-enhanced-choices-v1').length;
      const owned = document.createElement('button');
      owned.id = 'owned';
      owned.className = 'story-owned twine-player-enhanced-choice';
      owned.setAttribute('data-story', 'keep');
      owned.textContent = 'owned';
      root.appendChild(owned);
      const dynamic = document.createElement('button');
      dynamic.id = 'dynamic';
      dynamic.textContent = 'dynamic';
      root.appendChild(dynamic);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const dynamicMarked = dynamic.hasAttribute('data-twine-player-enhanced-choice');
      const ownedMarked = owned.hasAttribute('data-twine-player-enhanced-choice');
      const markedCountBeforeRemoval = document.querySelectorAll('[data-twine-player-enhanced-choice]').length;
      root.removeChild(dynamic);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const removedClean = !dynamic.classList.contains('twine-player-enhanced-choice') &&
        !dynamic.hasAttribute('data-twine-player-enhanced-choice');
      const markedCountAfterRemoval = document.querySelectorAll('[data-twine-player-enhanced-choice]').length;
      const exclusions = ['canvas', 'svg', '[contenteditable="true"]', '[draggable="true"]'].map((selector, index) => {
        const container = document.createElement(index === 2 ? 'div' : index === 3 ? 'div' : selector);
        if (index === 2) container.setAttribute('contenteditable', 'true');
        if (index === 3) container.setAttribute('draggable', 'true');
        const child = document.createElement('button');
        child.textContent = selector;
        container.appendChild(child);
        root.appendChild(container);
        return child;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const excludedMarked = exclusions.some((node) => node.hasAttribute('data-twine-player-enhanced-choice'));
      window.__twinePlayerSetEnhancedChoices(true);
      const styleCountAfterIdempotent = document.querySelectorAll('#twine-player-enhanced-choices-v1').length;
      window.__twinePlayerSetEnhancedChoices(false);
      const teardown = {
        styleRemoved: !document.getElementById('twine-player-enhanced-choices-v1'),
        observerRemoved: window.__twinePlayerEnhancedChoiceObserver === null,
        ownedClassPreserved: owned.classList.contains('story-owned') && owned.classList.contains('twine-player-enhanced-choice'),
        ownedAttributePreserved: owned.getAttribute('data-story') === 'keep',
        ownedMarkerRemoved: !owned.hasAttribute('data-twine-player-enhanced-choice'),
        storyClassPreserved: storyButton.classList.contains('story-owned'),
        storyLayoutPreserved: storyButton.style.width === '123px',
      };
      document.dispatchEvent(new MouseEvent('click', { bubbles: true, buttons: 3 }));
      return {
        styleCountOn,
        styleCountAfterIdempotent,
        dynamicMarked,
        ownedMarked,
        removedClean,
        excludedMarked,
        markedCountBeforeRemoval,
        markedCountAfterRemoval,
        teardown,
      };
    });

    if (result.styleCountOn !== 1 || result.styleCountAfterIdempotent !== 1) throw new Error('enhanced-choice style was not idempotent');
    if (!result.dynamicMarked || result.ownedMarked || !result.removedClean) throw new Error('dynamic/owned marker behavior failed');
    if (result.excludedMarked || result.markedCountBeforeRemoval < 2 || result.markedCountAfterRemoval < 1) throw new Error('exclusion or marker lifecycle coverage failed');
    if (Object.values(result.teardown).some((value) => value !== true)) throw new Error(`teardown failed: ${JSON.stringify(result.teardown)}`);

    const diagnostic = await page.evaluate(() => {
      window.__twinePlayerSetDiagnosticsEnabled(true);
      document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, buttons: 3 }));
      const parsed = window.__twinePlayerMessages
        .map((value) => {
          try { return JSON.parse(value); } catch (_) { return null; }
        })
        .filter((value) => value && value.type === 'input-diagnostic');
      return parsed[parsed.length - 1];
    });
    if (!diagnostic) throw new Error('enabled diagnostics did not emit metadata');
    const allowed = ['type', 'kind', 'category', 'buttons', 'contacts', 'origin'];
    if (Object.keys(diagnostic).some((key) => !allowed.includes(key))) throw new Error('diagnostic metadata was not allowlisted');
    if (diagnostic.origin !== 'webview' || diagnostic.category !== 'contextmenu') throw new Error('diagnostic metadata was not normalized');

    console.log('PASS bridge DOM runtime', JSON.stringify({ result, diagnostic }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`FAIL bridge DOM runtime: ${error.stack || error}`);
  process.exitCode = 1;
});
