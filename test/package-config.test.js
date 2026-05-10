const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
);

test('Electron Builder packaging uses an explicit runtime allowlist', () => {
  const files = packageJson.build && packageJson.build.files;

  assert.ok(Array.isArray(files), 'build.files should be an explicit array');

  const requiredRuntimeEntries = [
    'main.js',
    'preload.js',
    'index.html',
    'game.html',
    'src/**/*',
    'package.json',
  ];

  for (const entry of requiredRuntimeEntries) {
    assert.ok(files.includes(entry), `build.files should include ${entry}`);
  }

  const excludedEntries = [
    '!test/**/*',
    '!docs/**/*',
    '!dist/**/*',
    '!builder_debug/**/*',
    '!**/*_saves/**/*',
    '!**/*_illustrations/**/*',
    '!**/*.log',
  ];

  for (const entry of excludedEntries) {
    assert.ok(files.includes(entry), `build.files should exclude ${entry}`);
  }
});

test('Electron Builder packaging has stable release metadata', () => {
  assert.equal(packageJson.build.appId, 'com.twineplayer.app');
  assert.equal(packageJson.build.productName, 'Twine Player');
  assert.equal(packageJson.build.artifactName, 'TwinePlayer-${version}-${os}-${arch}.${ext}');
  assert.equal(packageJson.author, 'TwinePlayer contributors');
  assert.equal(packageJson.scripts['package:smoke'], 'npm run build:win:portable');
  assert.match(packageJson.scripts['build:win:portable'], /--publish never/);
});
