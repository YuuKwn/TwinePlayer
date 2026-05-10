const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

const readRootFile = (filename) => {
  return fs.readFileSync(path.join(rootDir, filename), 'utf8');
};

test('game page CSP does not allow inline styles', () => {
  const html = readRootFile('game.html');
  const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);

  assert.ok(cspMatch, 'game.html should define a Content-Security-Policy meta tag');
  assert.doesNotMatch(cspMatch[1], /'unsafe-inline'/);
});

test('game page keeps TwinePlayer-owned styles in CSS files', () => {
  const html = readRootFile('game.html');

  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
});

test('game scripts avoid HTML parsing for clear-only DOM updates', () => {
  const scriptFiles = [
    'src/game/dev-console.js',
    'src/game/save-modal.js',
    'src/game/illustrator-ui.js',
  ];

  for (const file of scriptFiles) {
    const source = readRootFile(file);
    assert.doesNotMatch(source, /innerHTML\s*=\s*['"]{2}/, `${file} should use textContent for clearing nodes`);
  }
});
