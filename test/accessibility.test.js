const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

const readRootFile = (filename) => {
  return fs.readFileSync(path.join(rootDir, filename), 'utf8');
};

test('library controls and cards expose keyboard and screen reader affordances', () => {
  const html = readRootFile('index.html');
  const rendererSource = readRootFile('src/renderer.js');
  const css = readRootFile('src/index.css');

  assert.match(html, /id="library-search"[^>]*aria-label="Search library"/);
  assert.match(rendererSource, /card\.tabIndex\s*=\s*0/);
  assert.match(rendererSource, /card\.setAttribute\('role', 'button'\)/);
  assert.match(rendererSource, /card\.setAttribute\('aria-label'/);
  assert.match(rendererSource, /e\.key === 'Enter' \|\| e\.key === ' '/);
  assert.match(css, /\.history-item:focus-visible/);
  assert.match(css, /\.history-item:focus-within \.remove-btn/);
});

test('game page icon-only controls have accessible labels', () => {
  const html = readRootFile('game.html');
  const devConsoleSource = readRootFile('src/game/dev-console.js');
  const illustratorSource = readRootFile('src/game/illustrator-ui.js');
  const css = readRootFile('src/game/game.css');

  assert.match(html, /id="pin-bar-btn"[^>]*aria-label="Pin top bar"/);
  assert.match(html, /id="layout-toggle"[^>]*aria-label="Toggle developer console layout"/);
  assert.match(html, /id="close-console"[^>]*aria-label="Close developer console"/);
  assert.match(html, /id="console-save"[^>]*aria-label="Save console command"/);
  assert.match(html, /id="toggle-illustration-dock"[^>]*aria-label="Toggle illustration dock"[^>]*aria-pressed="false"/);
  assert.match(html, /id="illustration-dock"[^>]*aria-label="Illustration dock"/);
  assert.match(html, /id="illustration-dock-thumbs"[^>]*role="list"[^>]*aria-label="Recent illustrations"/);
  assert.match(html, /id="illustrator-modal-overlay"[^>]*aria-describedby="illustrator-desc"[^>]*aria-busy="false"/);
  assert.match(html, /id="illus-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="illus-text-endpoint-input"[^>]*aria-describedby="illus-text-endpoint-help"/);
  assert.match(html, /id="illus-comfy-endpoint-input"[^>]*aria-describedby="illus-comfy-endpoint-help"/);
  assert.match(html, /aria-labelledby="illus-section-scene-title"/);
  assert.match(html, /aria-labelledby="illus-section-gallery-title"/);
  assert.match(devConsoleSource, /layoutToggleBtn\.setAttribute\('aria-pressed'/);
  assert.match(devConsoleSource, /pinBarBtn\.setAttribute\('aria-pressed'/);
  assert.match(devConsoleSource, /runBtn\.setAttribute\('aria-label'/);
  assert.match(devConsoleSource, /delBtn\.setAttribute\('aria-label'/);
  assert.match(illustratorSource, /illustrationDockThumbs\.addEventListener\('keydown'/);
  assert.match(illustratorSource, /toggleIllustrationDockBtn\.setAttribute\('aria-pressed'/);
  assert.match(illustratorSource, /illusOverlay\.setAttribute\('aria-busy'/);
  assert.match(css, /\.illus-section/);
});

test('save modal declares dialog relationships and keyboard-reachable save slots', () => {
  const html = readRootFile('game.html');
  const saveModalSource = readRootFile('src/game/save-modal.js');
  const css = readRootFile('src/game/game.css');

  assert.match(html, /id="saves-modal-overlay"[^>]*aria-labelledby="modal-title"[^>]*aria-describedby="saves-info"/);
  assert.match(html, /role="alertdialog"[^>]*aria-labelledby="save-confirm-title"[^>]*aria-describedby="save-confirm-message"/);
  assert.match(saveModalSource, /addSlot\.setAttribute\('aria-label', 'Create a new save'\)/);
  assert.match(saveModalSource, /slot\.setAttribute\('aria-label'/);
  assert.match(saveModalSource, /input\.setAttribute\('aria-describedby', 'new-save-error'\)/);
  assert.match(css, /\.save-slot:focus-visible/);
  assert.match(css, /\.save-slot:focus-within \.slot-delete/);
});

test('styles include reduced-motion safeguards without disabling hidden-panel transforms', () => {
  const indexCss = readRootFile('src/index.css');
  const gameCss = readRootFile('src/game/game.css');

  assert.match(indexCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(gameCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(indexCss, /transition-duration: 0\.01ms !important/);
  assert.match(gameCss, /transition-duration: 0\.01ms !important/);
  assert.match(gameCss, /\.illus-spinner,\s*[\s\S]*?\.spinning svg\s*\{\s*animation: none !important;/);

  const reducedMotionBlock = gameCss.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n        \}/);
  assert.ok(reducedMotionBlock, 'game.css should define a reduced-motion block');
  assert.doesNotMatch(reducedMotionBlock[0], /\.overlay-bar\s*,/);
  assert.doesNotMatch(reducedMotionBlock[0], /#dev-console\s*,/);
});

test('app shell styles expose the liquid glass treatment tokens', () => {
  const indexCss = readRootFile('src/index.css');
  const gameCss = readRootFile('src/game/game.css');

  assert.match(indexCss, /--glass-surface:/);
  assert.match(indexCss, /backdrop-filter: blur\(22px\) saturate\(1\.45\)/);
  assert.match(indexCss, /\.library-summary\.liquid-dom-enhanced/);
  assert.match(gameCss, /\/\* Liquid glass shell \*\//);
  assert.match(gameCss, /--glass-surface:/);
  assert.match(gameCss, /backdrop-filter: blur\(24px\) saturate\(1\.45\)/);
  assert.match(gameCss, /\.overlay-bar,\s*[\s\S]*?#dev-console,\s*[\s\S]*?\.saves-modal,\s*[\s\S]*?#illustrator-modal/);
});
