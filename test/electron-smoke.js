const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const electronPath = require('electron');

const appRoot = path.resolve(__dirname, '..');
const child = spawn(electronPath, [
  '--disable-gpu',
  '--disable-gpu-compositing',
  '--disable-software-rasterizer',
  appRoot,
], {
  cwd: appRoot,
  env: {
    ...process.env,
    TWINEPLAYER_E2E_SMOKE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
const timeout = setTimeout(() => {
  child.kill();
}, 15000);

child.stdout.on('data', (chunk) => {
  output += chunk.toString();
});

child.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

child.on('exit', (code) => {
  clearTimeout(timeout);
  if (code !== 0 && /GPU process isn't usable/.test(output)) {
    console.warn('Skipping Electron smoke assertion because this environment cannot start the Electron GPU process.');
    console.warn(output);
    return;
  }
  assert.equal(code, 0, output);
  assert.match(output, /TWINEPLAYER_E2E_READY index\.html/);
});
