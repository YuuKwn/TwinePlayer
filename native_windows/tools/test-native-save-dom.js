// Genuine-engine regression checks; no original game/save writes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('../../node_modules/@playwright/test');
const repo = path.resolve(__dirname, '../..');
const sources = ['shared/webview/twine-bridge.js', 'native_windows/src/TwinePlayer.Player/Bridge/NativeSaves.js'];
const script = sources.map(file => fs.readFileSync(path.join(repo, file), 'utf8')).join('\n');
const stories = ['native_windows/fixtures/sugarcube1/legacy-sugarcube1.html', 'test/fixtures/story-assistance-official/sugarcube_cssselectors_example.html', ...process.argv.slice(2)];
const output = path.join(repo, 'artifacts', 'native-save-dom-' + crypto.randomUUID());
fs.mkdirSync(output, { recursive: true });
async function main() {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const file of stories) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let downloads = 0, pickers = 0;
      page.on('download', async value => { downloads++; await value.cancel(); });
      page.on('filechooser', () => { pickers++; });
      await page.addInitScript(() => {
        window.__saveTestMessages = [];
        window.chrome = { webview: { postMessage(value) { __saveTestMessages.push(JSON.parse(value)); } } };
      });
      await page.addInitScript({ content: script });
      await page.route('**/*', route => route.request().url() === 'http://127.0.0.1/game.html' ? route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.resolve(repo, file), 'utf8') }) : route.abort());
      await page.goto('http://127.0.0.1/game.html');
      await page.waitForFunction(() => !!((window.SugarCube?.State?.passage || window.SugarCube?.state?.active?.title) && document.querySelector('#passages .passage')));
      const result = await page.evaluate(async () => {
        const state = () => SugarCube.State || SugarCube.state;
        const vars = () => state().variables || state().active.variables;
        const passage = () => state().passage || state().active.title;
        const wait = async predicate => { for (let i = 0; i < 250; i++) { const value = predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('Engine operation did not settle'); };
        const visible = () => Array.from(document.querySelectorAll('#ui-dialog,#ui-overlay,#ui-body')).some(el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0 && el.getBoundingClientRect().height > 0; });
        const captures = [];
        for (let round = 0; round < 2; round++) {
          vars().__nativeDialogMarker = 'round-' + round;
          if (SugarCube.Engine) SugarCube.Engine.play(passage()); else SugarCube.state.display(passage());
          const id = crypto.randomUUID();
          const capture = __twinePlayerCaptureSave(id);
          if (!capture.ok) throw new Error(capture.error);
          const saved = capture.pending ? await wait(() => __saveTestMessages.find(m => m.operationId === id && ['save-bytes', 'save-result'].includes(m.type))) : { bytes: Array.from(new TextEncoder().encode(capture.data)) };
          if (!saved.bytes) throw new Error(saved.error);
          vars().__nativeDialogMarker = 'changed';
          const restoreId = crypto.randomUUID();
          const restored = __twinePlayerRestoreSave(new TextDecoder().decode(new Uint8Array(saved.bytes)), restoreId);
          if (!restored.ok) throw new Error(restored.error);
          const complete = await wait(() => __saveTestMessages.find(m => m.type === 'load-result' && m.operationId === restoreId));
          if (!complete.success || vars().__nativeDialogMarker !== 'round-' + round) throw new Error(complete.error || 'Engine state did not restore');
          if (visible()) throw new Error('Engine save UI is visible');
          captures.push(saved.bytes);
        }
        const invalidId = crypto.randomUUID();
        __twinePlayerRestoreSave('invalid-save-regression', invalidId);
        const invalid = await wait(() => __saveTestMessages.find(m => m.type === 'load-result' && m.operationId === invalidId));
        if (invalid.success || vars().__nativeDialogMarker !== 'round-1' || visible()) throw new Error('Invalid save did not fail safely without game UI');
        const retryId = crypto.randomUUID();
        __twinePlayerRestoreSave(new TextDecoder().decode(new Uint8Array(captures[1])), retryId);
        const retry = await wait(() => __saveTestMessages.find(m => m.type === 'load-result' && m.operationId === retryId));
        if (!retry.success) throw new Error('Retry after invalid save failed: ' + retry.error);
        await new Promise(resolve => setTimeout(resolve, 350));
        if (visible() || document.getElementById('twineplayer-save-operation')) throw new Error('Game dialog or temporary suppression leaked after completion: ' + JSON.stringify({ html: document.documentElement.className, ui: Object.getOwnPropertyNames(SugarCube.UISystem || {}), close:String(SugarCube.UISystem?.close), elements: Array.from(document.querySelectorAll('[id^="ui-"]')).map(el => ({id:el.id,cls:el.className,style:el.getAttribute('style'),opacity:getComputedStyle(el).opacity,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,text:el.id==='ui-body'?el.textContent.slice(0,200):''})) }));
        const config = window.Config || SugarCube.Config || SugarCube.config;
        let deniedSave = false;
        if (config?.saves) {
          const previous = config.saves.isAllowed;
          try {
            config.saves.isAllowed = () => false;
            const deniedId = crypto.randomUUID();
            const denied = __twinePlayerCaptureSave(deniedId);
            const settlement = denied.ok ? await wait(() => __saveTestMessages.find(m => m.operationId === deniedId)) : denied;
            if (settlement.bytes || settlement.success === true) throw new Error('Engine-denied save was captured');
            deniedSave = true;
          } finally { config.saves.isAllowed = previous; }
          await new Promise(resolve => setTimeout(resolve, 350));
          if (visible()) throw new Error('Engine-denied save leaked a game alert');
          const originalId = config.saves.id;
          let foreign;
          try {
            config.saves.id = 'native-regression-other-story';
            const foreignId = crypto.randomUUID();
            const captured = __twinePlayerCaptureSave(foreignId);
            if (!captured.ok) throw new Error(captured.error);
            foreign = captured.pending ? await wait(() => __saveTestMessages.find(m => m.operationId === foreignId)) : { bytes: Array.from(new TextEncoder().encode(captured.data)) };
            if (!foreign.bytes) throw new Error(foreign.error);
          } finally { config.saves.id = originalId; }
          const wrongId = crypto.randomUUID();
          __twinePlayerRestoreSave(new TextDecoder().decode(new Uint8Array(foreign.bytes)), wrongId);
          const wrong = await wait(() => __saveTestMessages.find(m => m.type === 'load-result' && m.operationId === wrongId));
          if (wrong.success || vars().__nativeDialogMarker !== 'round-1') throw new Error('Save from another story was accepted');
          await new Promise(resolve => setTimeout(resolve, 350));
          if (visible()) throw new Error('Foreign-save rejection leaked game UI');
        }
        const ui = SugarCube.UI || SugarCube.UISystem;
        ui.alert('Unrelated game prompt regression');
        await new Promise(resolve => setTimeout(resolve, 220));
        if (!visible()) throw new Error('Unrelated game prompts were suppressed');
        (SugarCube.Dialog || SugarCube.UISystem).close();
        await new Promise(resolve => setTimeout(resolve, 250));
        const input = document.createElement('input'); input.type = 'file'; input.id = 'regression-save-import'; input.accept = '.save'; document.body.append(input);
        const label = document.createElement('label'); label.htmlFor = input.id; label.textContent = 'Load regression'; document.body.append(label);
        return { version: document.querySelector('tw-storydata')?.getAttribute('format-version'), firstAndRepeatedRestore: true, invalidSave: true, retry: true, deniedSave };
      });
      const requestsBefore = await page.evaluate(() => __saveTestMessages.filter(m => m.type === 'load-request').length);
      await page.evaluate(() => document.getElementById('regression-save-import').click());
      await page.locator('label[for="regression-save-import"]').click();
      await page.evaluate(() => document.getElementById('regression-save-import').showPicker());
      const requestsAfter = await page.evaluate(() => __saveTestMessages.filter(m => m.type === 'load-request').length);
      assert.equal(requestsAfter - requestsBefore, 3, 'All picker entry points must route to native UI');
      assert.equal(pickers, 0); assert.equal(downloads, 0);
      results.push({ ...result, nativePickerRequests: 3, downloads, pickers });
      console.log('PASS SugarCube ' + result.version + ' direct saves, invalid/retry and first-use picker suppression');
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, scope: 'Headless Chromium genuine engine regression; native WebView2 checked separately', results }, null, 2));
    console.log('REPORT=' + path.join(output, 'report.json'));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, error: String(error.stack), results }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
