// Native-only save adapter. Install before story scripts can cache browser methods.
;(() => {
  const browserInputClick = HTMLInputElement.prototype.click;
  window.__twinePlayerInstallInterceptors();
  const post = value => window.__twinePlayerPost(value);
  const limit = 50 * 1024 * 1024;
  const api = () => window.Save || window.SugarCube?.Save;
  const legacy = () => window.SugarCube?.SaveSystem;
  const supported = () => !!(api()?.disk || api()?.export || api()?.serialize || api()?.base64 || legacy()?.exportSave);
  let operation = null;
  const message = error => String(error?.message || error || 'The game rejected the save.').slice(0, 4096);
  const dialog = () => document.querySelector('#ui-dialog-body,#ui-body');
  const dialogOpen = () => !!(window.Dialog?.isOpen?.() || window.SugarCube?.Dialog?.isOpen?.() || window.SugarCube?.UISystem?.isOpen?.() || document.documentElement.classList.contains('ui-open'));
  const closeSaveDialog = (force = false) => {
    const body = dialog();
    if (force || body && /(?:^|\s)(?:saves|alert)(?:\s|$)/.test(body.className)) {
      const ui = window.Dialog || window.SugarCube?.Dialog || window.SugarCube?.UISystem;
      ui?.close?.();
      // SC1 queues overlay fades; finish this operation's animation so an error
      // cannot leave a transparent click-blocking layer above the story.
      if (legacy()) window.jQuery?.('#ui-overlay').stop(true, true).hide();
    }
  };
  function begin(kind, id) {
    if (operation) throw new Error('Finish the current save/load action first.');
    if (dialogOpen()) throw new Error('Close the game dialog before saving or loading.');
    const style = document.createElement('style');
    style.id = 'twineplayer-save-operation';
    // Legacy engines display errors instead of returning them. Keep only these
    // operation-generated dialogs offscreen until their message reaches native UI.
    style.textContent = '#ui-dialog,#ui-overlay,#ui-dialog-overlay{visibility:hidden!important;pointer-events:none!important}';
    (document.head || document.documentElement).append(style);
    const value = { kind, id, style, error: '', timer: null, observer: null };
    value.observer = new MutationObserver(() => {
      const body = dialog();
      if (dialogOpen() && body && /(?:^|\s)alert(?:\s|$)/.test(body.className)) {
        value.error = body.textContent.trim().slice(0, 4096) || 'The game rejected the save.';
        finish(value, new Error(value.error));
      }
    });
    value.observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    operation = value;
    value.timer = setTimeout(() => finish(value, new Error('The game did not finish the save/load operation. Please retry.')), 14000);
    return value;
  }
  function cleanup(value) {
    clearTimeout(value.timer); value.observer.disconnect();
    if (value.error || dialogOpen()) { closeSaveDialog(true); setTimeout(() => value.style.remove(), 250); }
    else value.style.remove();
    if (operation === value) operation = null;
  }
  function finish(value, error, payload) {
    if (operation !== value) return;
    const failure = error ? message(error) : value.error;
    if (failure) value.error = failure;
    cleanup(value);
    if (value.kind === 'load') post({ type: 'load-result', operationId: value.id, success: !failure, error: failure });
    else if (failure) post({ type: 'save-result', operationId: value.id, success: false, error: failure });
    else post({ type: 'save-bytes', operationId: value.id, ...payload });
  }
  window.__twinePlayerCancelNativeSave = id => { if (operation?.id === id) cleanup(operation); };

  const detect = window.__twinePlayerDetectEngine;
  window.__twinePlayerDetectEngine = () => legacy()?.exportSave ? 'sc1' : detect();
  window.__twinePlayerCaptureSave = id => {
    let value;
    try {
      if (!supported()) throw new Error('Native save/load supports SugarCube 1 and 2.');
      value = begin('save', id);
      const save = api();
      if (save?.disk?.save) save.disk.save('game');
      else if (save?.export) save.export('game');
      else if (legacy()?.exportSave) legacy().exportSave();
      else {
        const data = save?.base64?.save ? save.base64.save() : save.serialize();
        if (!data) throw new Error('The game did not allow this save.');
        cleanup(value);
        return { ok: true, data: String(data) };
      }
      return { ok: true, pending: true };
    } catch (error) { if (value) cleanup(value); return { ok: false, error: message(error) }; }
  };

  window.__twinePlayerRestoreSave = (text, id = window.__twinePlayerNativeLoadId) => {
    let value;
    try {
      if (!supported()) throw new Error('Native save/load supports SugarCube 1 and 2.');
      value = begin('load', id);
      const save = api();
      if (save?.disk?.load || save?.import || legacy()?.importSave) {
        const input = document.createElement('input'); input.type = 'file';
        const transfer = new DataTransfer(); transfer.items.add(new File([text], 'game.save', { type: 'text/plain' })); input.files = transfer.files;
        if (save?.disk?.load) {
          const pending = save.disk.load({ target: input });
          Promise.resolve(pending).then(() => { (window.Engine || window.SugarCube?.Engine)?.show(); finish(value); }).catch(error => finish(value, error));
        } else {
          // Legacy imports return void. Observe their own FileReader after the
          // engine's loadend handler, then require actual restored engine state.
          const state = window.SugarCube?.State || window.SugarCube?.state;
          const before = state?.active;
          const Reader = window.FileReader;
          window.FileReader = class extends Reader {
            constructor() {
              super();
              queueMicrotask(() => this.addEventListener('loadend', () => setTimeout(() => {
                const restored = (window.SugarCube?.State || window.SugarCube?.state)?.active;
                finish(value, this.error || value.error || (restored === before ? new Error('The game rejected this save or did not restore its state.') : null));
              }, 0), { once: true }));
            }
          };
          try { if (save?.import) save.import({ target: input }); else legacy().importSave({ target: input }); }
          finally { window.FileReader = Reader; }
        }
      } else if (save?.base64?.load) {
        Promise.resolve(save.base64.load(text)).then(() => { (window.Engine || window.SugarCube?.Engine)?.show(); finish(value); }).catch(error => finish(value, error));
      } else if (save?.deserialize) {
        const state = window.SugarCube?.State || window.SugarCube?.state;
        const before = state?.active; save.deserialize(text);
        setTimeout(() => finish(value, state?.active === before ? new Error('The game rejected the save.') : null), 0);
      } else throw new Error('This SugarCube version has no supported load API.');
      return { ok: true, pending: true };
    } catch (error) { if (value) cleanup(value); return { ok: false, error: message(error) }; }
  };

  // Cover FileSaver's dispatchEvent, scripted clicks and normal anchor activation.
  const owners = new WeakMap();
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (blob) { if (operation?.kind === 'save') owners.set(blob, operation); return createObjectURL.call(this, blob); };
  function captureAnchor(anchor) {
    const blob = anchor.hasAttribute('download') && window.__twinePlayerBlobRegistry.get(anchor.href);
    if (!blob || !(operation?.kind === 'save' || /\.save$/i.test(anchor.download))) return false;
    const value = owners.get(blob) || (operation?.kind === 'save' ? operation : null);
    if (value && operation !== value) return true;
    if (blob.size <= 0 || blob.size > limit) {
      if (value) finish(value, new Error('Save data is empty or exceeds 50 MiB.'));
      else window.__twinePlayerLog('Save data is empty or exceeds 50 MiB.', 'error');
      return true;
    }
    const filename = (anchor.download || 'game.save').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 200);
    blob.arrayBuffer().then(buffer => {
      const payload = { filename, bytes: Array.from(new Uint8Array(buffer)) };
      if (value) finish(value, null, payload); else post({ type: 'save-bytes', ...payload });
    }, error => { if (value) finish(value, error); else window.__twinePlayerLog(message(error), 'error'); });
    return true;
  }
  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (!captureAnchor(this)) return anchorClick.call(this); };
  const dispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (event) { return event.type === 'click' && captureAnchor(this) ? true : dispatch.call(this, event); };

  function saveInput(input) {
    return supported() && input?.type === 'file' && (/save|import|load/i.test(input.id + ' ' + input.name) || /\.save(?:\b|s?bundle)/i.test(input.accept) || !!input.closest('#ui-dialog,#ui-body'));
  }
  function requestLoad(input) {
    if (input?.accept?.includes('savesbundle') || /bundle/i.test(input?.id || '')) {
      window.__twinePlayerLog('Browser save bundles are not single game saves. Use the game’s bundle import tools.', 'error'); return;
    }
    window.__twinePlayerPendingLoadInput = null;
    closeSaveDialog();
    post({ type: 'load-request' });
  }
  HTMLInputElement.prototype.click = function () { if (saveInput(this)) requestLoad(this); else return browserInputClick.call(this); };
  const picker = HTMLInputElement.prototype.showPicker;
  if (picker) HTMLInputElement.prototype.showPicker = function () { if (saveInput(this)) requestLoad(this); else return picker.call(this); };
  document.addEventListener('click', event => {
    if (supported() && event.target?.closest?.('#menu-item-saves,#menu-saves')) {
      event.preventDefault(); event.stopImmediatePropagation(); requestLoad(); return;
    }
    const target = event.target?.closest?.('a,button,input,label');
    if (!target) return;
    const input = target instanceof HTMLLabelElement ? target.control : target;
    if (saveInput(input)) { event.preventDefault(); event.stopImmediatePropagation(); requestLoad(input); }
    else if (target instanceof HTMLAnchorElement && captureAnchor(target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  // Retain this bridge entry point for older callers without constructing game UI.
  window.__twinePlayerPrepareNativeLoad = () => { post({ type: 'load-request' }); return { ok: true, method: 'native-manager' }; };
})();
