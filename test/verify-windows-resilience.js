/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const header = fs.readFileSync(
  path.join(root, 'flutter_app', 'windows', 'runner', 'flutter_window.h'),
  'utf8',
);
const source = fs.readFileSync(
  path.join(root, 'flutter_app', 'windows', 'runner', 'flutter_window.cpp'),
  'utf8',
);

const required = [
  ['ApplyFullscreenBounds declaration', header, 'ApplyFullscreenBounds();'],
  ['fullscreen monitor re-query', source, 'MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)'],
  ['display topology recovery', source, 'WM_DISPLAYCHANGE'],
  ['fullscreen DPI recovery', source, 'WM_DPICHANGED'],
  ['windowed suggested rectangle path', source, 'break;'],
  ['restore rectangle clamping', source, 'std::clamp'],
  ['work-area recovery', source, 'rcWork'],
  ['frame recalculation', source, 'SWP_FRAMECHANGED'],
];
for (const [label, text, needle] of required) {
  if (!text.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}
console.log('PASS Windows fullscreen/DPI source contract');
