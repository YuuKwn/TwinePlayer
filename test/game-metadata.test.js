const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  extractGameMetadata,
  extractGameMetadataFromHtml,
  getTitleFromFilename,
} = require('../src/main/game-metadata');

test('extractGameMetadataFromHtml prefers tw-storydata name', () => {
  const result = extractGameMetadataFromHtml(
    '<html><head><title>Document Title</title></head><body><tw-storydata name="Story &amp; Name"></tw-storydata></body></html>',
    'F:\\Games\\fallback.html'
  );

  assert.deepEqual(result, {
    title: 'Story & Name',
    source: 'tw-storydata',
  });
});

test('extractGameMetadataFromHtml falls back to document title', () => {
  const result = extractGameMetadataFromHtml(
    '<html><head><title>  A   Great &lt;Story&gt; </title></head></html>',
    'F:\\Games\\fallback.html'
  );

  assert.deepEqual(result, {
    title: 'A Great <Story>',
    source: 'title',
  });
});

test('getTitleFromFilename formats html filenames', () => {
  assert.equal(getTitleFromFilename('F:\\Games\\deep_story-file.htm'), 'Deep Story File');
});

test('extractGameMetadata reads metadata from disk', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-player-metadata-'));
  try {
    const gamePath = path.join(tempDir, 'Example Story.html');
    fs.writeFileSync(gamePath, '<title>Ignored</title><tw-storydata name="Disk Story"></tw-storydata>');

    assert.deepEqual(await extractGameMetadata(gamePath), {
      title: 'Disk Story',
      source: 'tw-storydata',
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
