const fs = require('node:fs');
const path = require('node:path');

const fsp = fs.promises;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;

const decodeHtmlEntities = (value) => {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
};

const normalizeWhitespace = (value) => value.replace(/\s+/g, ' ').trim();

const getTitleFromFilename = (filePath) => {
  const filename = path.basename(filePath);
  const cleanName = filename.replace(/\.html?$/i, '').replace(/[-_]/g, ' ');
  return cleanName.replace(/\b\w/g, letter => letter.toUpperCase()) || 'Unknown Game';
};

const readMetadataSnippet = async (filePath) => {
  const handle = await fsp.open(filePath, 'r');
  try {
    const stats = await handle.stat();
    const length = Math.min(stats.size, MAX_METADATA_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
};

const getAttributeValue = (tag, attributeName) => {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  const match = tag.match(pattern);
  return match ? normalizeWhitespace(decodeHtmlEntities(match[2])) : '';
};

const extractGameMetadataFromHtml = (html, filePath = '') => {
  const storyDataMatch = html.match(/<tw-storydata\b[^>]*>/i);
  const storyName = storyDataMatch ? getAttributeValue(storyDataMatch[0], 'name') : '';

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? normalizeWhitespace(decodeHtmlEntities(titleMatch[1])) : '';

  return {
    title: storyName || title || (filePath ? getTitleFromFilename(filePath) : 'Unknown Game'),
    source: storyName ? 'tw-storydata' : (title ? 'title' : 'filename'),
  };
};

const extractGameMetadata = async (filePath) => {
  const html = await readMetadataSnippet(filePath);
  return extractGameMetadataFromHtml(html, filePath);
};

module.exports = {
  extractGameMetadata,
  extractGameMetadataFromHtml,
  getTitleFromFilename,
};
