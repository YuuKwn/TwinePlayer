const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

const readRootFile = (filename) => {
  return fs.readFileSync(path.join(rootDir, filename), 'utf8');
};

const getCsp = (filename) => {
  const html = readRootFile(filename);
  const cspMatch = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);

  assert.ok(cspMatch, `${filename} should define a Content-Security-Policy meta tag`);
  return cspMatch[1];
};

test('app page CSPs do not allow inline styles', () => {
  for (const filename of ['index.html', 'game.html']) {
    assert.doesNotMatch(getCsp(filename), /'unsafe-inline'/, `${filename} should not allow inline styles`);
  }
});

test('app pages keep TwinePlayer-owned styles in CSS files', () => {
  for (const filename of ['index.html', 'game.html']) {
    const html = readRootFile(filename);

    assert.doesNotMatch(html, /<style\b/i, `${filename} should not contain style tags`);
    assert.doesNotMatch(html, /\sstyle\s*=/i, `${filename} should not contain style attributes`);
  }
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

test('library cards use CSS classes for animation delays', () => {
  const rendererSource = readRootFile('src/renderer.js');
  const css = readRootFile('src/index.css');

  assert.doesNotMatch(rendererSource, /\.style\.animationDelay/);
  assert.match(rendererSource, /history-delay-\$\{Math\.min\(displayIndex, 5\)\}/);
  assert.match(css, /\.history-delay-5\s*\{\s*animation-delay: 0\.5s;/);
});
