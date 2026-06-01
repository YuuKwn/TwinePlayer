String twineBridgeScript() {
  return r'''
(function () {
  if (window.__twinePlayerFlutterBridgeInstalled) return;
  window.__twinePlayerFlutterBridgeInstalled = true;
  window.__twinePlayerBlobRegistry = new Map();
  window.__twinePlayerPendingLoadInput = null;
  window.__twinePlayerPreparingLoadFromHost = false;
  window.__twinePlayerLoadRequestPosted = false;
  window.__twinePlayerLog = function (message, level) {
    try {
      window.chrome.webview.postMessage(JSON.stringify({
        type: 'log',
        message: String(message),
        level: level || 'normal'
      }));
    } catch (_) {}
  };
  window.__twinePlayerPost = function (payload) {
    try {
      window.chrome.webview.postMessage(JSON.stringify(payload));
    } catch (err) {
      window.__twinePlayerLog('Bridge post failed: ' + err.message, 'error');
    }
  };
  window.__twinePlayerIdentify = function () {
    try {
      var storyData = document.querySelector('tw-storydata');
      var ifid = storyData && storyData.getAttribute('ifid');
      var title = (storyData && storyData.getAttribute('name')) || document.title || '';
      window.__twinePlayerPost({ type: 'identity', ifid: ifid || '', title: title });
    } catch (err) {
      window.__twinePlayerLog('Identity read failed: ' + err.message, 'error');
    }
  };
  window.__twinePlayerDetectEngine = function () {
    var sc2 = window.Save || (window.SugarCube && window.SugarCube.Save);
    if (sc2 && (sc2.base64 || sc2.disk || typeof sc2.serialize === 'function' || typeof sc2.export === 'function')) {
      window.__twinePlayerEngineType = 'sc2';
      window.__twinePlayerSaveApi = sc2;
      return 'sc2';
    }
    var sc1 = window.save;
    if (sc1 && typeof sc1.serialize === 'function') {
      window.__twinePlayerEngineType = 'sc1';
      window.__twinePlayerSaveApi = sc1;
      return 'sc1';
    }
    return 'unknown';
  };
  window.__twinePlayerDescribeError = function (err, stage) {
    if (err && err.message) return stage + ': ' + err.message;
    if (err === null || err === undefined) return stage + ' failed without error details.';
    return stage + ': ' + String(err);
  };
  window.__twinePlayerHandleLoadPromise = function (promise, stage) {
    var settled = false;
    window.setTimeout(function () {
      if (!settled) {
        window.__twinePlayerLog(stage + ' has not completed yet. The game may be waiting in a custom save/load handler.', 'error');
      }
    }, 8000);
    Promise.resolve(promise).then(function () {
      settled = true;
      if (window.Engine && typeof window.Engine.show === 'function') window.Engine.show();
      window.__twinePlayerLog(stage + ' complete.', 'result');
    }).catch(function (err) {
      settled = true;
      window.__twinePlayerLog(window.__twinePlayerDescribeError(err, stage), 'error');
    });
    return { ok: true, pending: true, method: stage };
  };
  window.__twinePlayerCloseNativeSaveDialog = function () {
    try {
      var sc = window.SugarCube || {};
      if (sc.UI && typeof sc.UI.close === 'function') {
        window.setTimeout(function () { sc.UI.close(); }, 100);
        return true;
      }

      var closeButton =
        document.getElementById('ui-overlay-close') ||
        document.querySelector('#ui-dialog-close') ||
        document.querySelector('[id$="ui-dialog-close"]') ||
        document.querySelector('[aria-label="Close"]');
      if (closeButton && typeof closeButton.click === 'function') {
        window.setTimeout(function () { closeButton.click(); }, 100);
        return true;
      }
    } catch (err) {
      window.__twinePlayerLog(window.__twinePlayerDescribeError(err, 'Close native save dialog'), 'error');
    }
    return false;
  };
  window.__twinePlayerPostLoadRequest = function () {
    if (window.__twinePlayerLoadRequestPosted) return;
    window.__twinePlayerLoadRequestPosted = true;
    window.__twinePlayerPost({ type: 'load-request' });
  };
  window.__twinePlayerCaptureSave = function () {
    var engine = window.__twinePlayerDetectEngine();
    var api = window.__twinePlayerSaveApi;
    try {
      if (engine === 'sc2' && api) {
        if (api.disk && typeof api.disk.save === 'function') {
          api.disk.save('twineplayer-save');
          return { ok: true, pending: true, format: 'sugarcube-disk', method: 'Save.disk.save' };
        }
        if (api.base64 && typeof api.base64.save === 'function') {
          var base64Save = api.base64.save();
          if (base64Save) return { ok: true, format: 'sugarcube-base64', mime: 'text/plain;charset=UTF-8', data: String(base64Save) };
        }
        if (api.base64 && typeof api.base64.export === 'function') {
          var base64Export = api.base64.export();
          if (base64Export) return { ok: true, format: 'sugarcube-base64-bundle', mime: 'text/plain;charset=UTF-8', data: String(base64Export) };
        }
        if (typeof api.serialize === 'function') {
          var serialized = api.serialize();
          if (serialized) return { ok: true, format: 'sugarcube-legacy-serialized', mime: 'text/plain;charset=UTF-8', data: String(serialized) };
        }
        if (typeof api.export === 'function') {
          var htmlExport = api.export('twineplayer-save');
          if (htmlExport) return { ok: true, format: 'sugarcube-legacy-disk', mime: 'text/html;charset=UTF-8', data: String(htmlExport) };
          return { ok: false, error: 'SugarCube native export did not return save data. Try the game save menu once, then use TwinePlayer Save again.' };
        }
      }
      if (engine === 'sc1' && api) {
        var sc1Data = api.serialize();
        if (sc1Data) return { ok: true, format: 'sugarcube-1-serialized', mime: 'text/plain;charset=UTF-8', data: String(sc1Data) };
      }
      return { ok: false, error: 'Unsupported engine. Engine detected as: ' + engine };
    } catch (err) {
      return { ok: false, error: window.__twinePlayerDescribeError(err, 'Save capture') };
    }
  };
  window.__twinePlayerRestoreSave = function (text) {
    var engine = window.__twinePlayerDetectEngine();
    var api = window.__twinePlayerSaveApi;
    var data = String(text || '').trim();
    var originalData = data;
    var isHtmlDiskSave = data.indexOf('<html') >= 0 || data.indexOf('<!DOCTYPE') >= 0 || data.indexOf('<tw-serialized-save') >= 0;
    if (data.indexOf('<html') >= 0 || data.indexOf('<!DOCTYPE') >= 0 || data.indexOf('<tw-serialized-save') >= 0) {
      var twMatch = data.match(/<tw-serialized-save[^>]*>([\s\S]*?)<\/tw-serialized-save>/i);
      if (twMatch) {
        data = twMatch[1].trim();
      } else {
        var b64Match = data.match(/[A-Za-z0-9+/=]{100,}/);
        if (b64Match) data = b64Match[0];
        else {
          var jsonMatch = data.match(/\{[\s\S]*\}/);
          if (jsonMatch) data = jsonMatch[0];
        }
      }
    }
    function applyState(saveData) {
      if (!saveData || typeof saveData !== 'object') return false;
      var sugarCube = window.SugarCube || {};
      var stateApi = window.State || sugarCube.State;
      var stateData = saveData.state || saveData;
      if (stateApi && typeof stateApi.unmarshalForSave === 'function' && stateData && typeof stateData === 'object') {
        stateApi.unmarshalForSave(stateData);
        return true;
      }
      if (stateApi && typeof stateApi.unmarshal === 'function' && stateData && typeof stateData === 'object') {
        stateApi.unmarshal(stateData);
        return true;
      }
      return false;
    }
    function injectPendingLoadInput() {
      if (!window.__twinePlayerPendingLoadInput) return false;
      var loadInput = window.__twinePlayerPendingLoadInput;
      var type = isHtmlDiskSave ? 'text/html' : 'text/plain';
      var file = new File([originalData], 'twineplayer.save', { type: type });
      var transfer = new DataTransfer();
      transfer.items.add(file);
      loadInput.files = transfer.files;
      loadInput.dispatchEvent(new Event('change', { bubbles: true }));
      window.__twinePlayerPendingLoadInput = null;
      window.__twinePlayerCloseNativeSaveDialog();
      window.__twinePlayerLog('Native SugarCube disk load input received save file.', 'result');
      return true;
    }
    try {
      if (engine === 'sc2' && api) {
        if (injectPendingLoadInput()) {
          return { ok: true, method: 'native-file-input' };
        }

        if (isHtmlDiskSave && api.disk && typeof api.disk.load === 'function') {
          var diskFile = new File([originalData], 'twineplayer.save', { type: 'text/html' });
          var diskInput = document.createElement('input');
          diskInput.type = 'file';
          var diskTransfer = new DataTransfer();
          diskTransfer.items.add(diskFile);
          diskInput.files = diskTransfer.files;
          var diskEvent = new Event('change', { bubbles: true });
          Object.defineProperty(diskEvent, 'target', { value: diskInput });
          Object.defineProperty(diskEvent, 'currentTarget', { value: diskInput });
          return window.__twinePlayerHandleLoadPromise(api.disk.load(diskEvent), 'Save.disk.load');
        }

        var result = false;
        if (data.charAt(0) === '{') {
          try {
            var obj = JSON.parse(data);
            result = applyState(obj) ? true : obj;
          } catch (_) {}
        }
        if (result === false) {
          var clean = data.replace(/[^A-Za-z0-9+/=]/g, '');
          if (api.base64 && typeof api.base64.load === 'function') {
            return window.__twinePlayerHandleLoadPromise(api.base64.load(clean), 'Save.base64.load');
          } else if (api.base64 && typeof api.base64.decode === 'function') {
            result = api.base64.decode(clean);
          } else if (typeof api.deserialize === 'function') {
            result = api.deserialize(clean);
          } else if (api.base64 && typeof api.base64.import === 'function') {
            result = api.base64.import(clean);
          }
        }
        if (result && typeof result === 'object' && !applyState(result)) {
          return { ok: false, error: 'Save decoded, but no SugarCube state API accepted it.' };
        }
        if (result !== false && result !== null) {
          if (window.Engine && typeof window.Engine.show === 'function') window.Engine.show();
          return { ok: true };
        }
        return { ok: false, error: 'Engine rejected the save data.' };
      }
      if (engine === 'sc1' && api) {
        api.deserialize(data);
        return { ok: true };
      }
      return { ok: false, error: 'Unsupported engine. Engine detected as: ' + engine };
    } catch (err) {
      return { ok: false, error: window.__twinePlayerDescribeError(err, 'Save load') };
    }
  };
  window.__twinePlayerPrepareNativeLoad = function () {
    window.__twinePlayerPendingLoadInput = null;
    window.__twinePlayerPreparingLoadFromHost = true;
    window.__twinePlayerLoadRequestPosted = false;

    var sc = window.SugarCube || {};
    var startedAt = Date.now();

    var findNativeDiskLoad = function () {
      var dialogRoot =
        document.getElementById('ui-dialog-body') ||
        document.getElementById('ui-dialog') ||
        document;

      var exactLoad =
        dialogRoot.querySelector('#saves-disk-load') ||
        dialogRoot.querySelector('[id$="saves-disk-load"]') ||
        dialogRoot.querySelector('#saves-load') ||
        dialogRoot.querySelector('[id$="saves-load"]');
      if (exactLoad && !((exactLoad.id || '').toLowerCase().includes('import'))) {
        return exactLoad;
      }

      var candidates = Array.from(dialogRoot.querySelectorAll('button, a, input[type="button"], [role="button"]'));
      return candidates.find(function (el) {
        var text = ((el.textContent || el.value || '') + '').trim().toLowerCase().replace(/\s+/g, ' ');
        var id = (el.id || '').toLowerCase();
        var className = (el.className || '').toString().toLowerCase();
        var label = id + ' ' + className + ' ' + text;
        return label.includes('load') &&
          label.includes('disk') &&
          !label.includes('import') &&
          !label.includes('export');
      });
    };

    var tryClickDiskLoad = function () {
      var button = findNativeDiskLoad();
      if (button) {
        button.click();
        window.setTimeout(function () {
          if (!window.__twinePlayerPendingLoadInput) {
            window.__twinePlayerPreparingLoadFromHost = false;
            window.__twinePlayerPostLoadRequest();
          }
        }, 180);
        return;
      }

      if (Date.now() - startedAt < 1200) {
        window.setTimeout(tryClickDiskLoad, 50);
      } else {
        window.__twinePlayerPreparingLoadFromHost = false;
        window.__twinePlayerPostLoadRequest();
      }
    };

    try {
      if (sc && sc.UI && typeof sc.UI.saves === 'function') {
        window.__twinePlayerLog('Opening native SugarCube saves dialog for load bridge...', 'normal');
        sc.UI.saves();
        window.setTimeout(tryClickDiskLoad, 0);
        return { ok: true, method: 'SugarCube.UI.saves' };
      }
    } catch (err) {
      window.__twinePlayerLog(window.__twinePlayerDescribeError(err, 'Native load bridge'), 'error');
    }

    window.__twinePlayerPreparingLoadFromHost = false;
    window.__twinePlayerPostLoadRequest();
    return { ok: false, error: 'SugarCube native saves dialog is unavailable.' };
  };
  window.__twinePlayerRunCommand = function (command) {
    try {
      var result = window.eval(command);
      if (typeof result === 'object' && result !== null) return { ok: true, result: JSON.stringify(result, null, 2) };
      if (result === undefined) return { ok: true, result: 'undefined' };
      return { ok: true, result: String(result) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };
  window.__twinePlayerCompletions = function (inputText) {
    try {
      var text = String(inputText || '');
      var match = text.match(/(([a-zA-Z_$][0-9a-zA-Z_$]*\.)*)([a-zA-Z_$][0-9a-zA-Z_$]*)$/);
      var baseExpression = '';
      var pathStr = '';
      var prefix = '';
      if (match) {
        pathStr = match[1] || '';
        baseExpression = pathStr ? pathStr.slice(0, -1) : '';
        prefix = match[3] || '';
      } else if (text.endsWith('.')) {
        baseExpression = text.slice(0, -1);
        pathStr = text;
      } else {
        return [];
      }
      var baseObj = baseExpression ? window.eval(baseExpression) : window;
      if (baseObj == null) return [];
      var props = [];
      var current = baseObj;
      while (current) {
        props = props.concat(Object.getOwnPropertyNames(current));
        current = Object.getPrototypeOf(current);
      }
      return Array.from(new Set(props))
        .filter(function (prop) { return prop.indexOf(prefix) === 0 && prop !== prefix; })
        .sort()
        .slice(0, 50)
        .map(function (prop) { return pathStr + prop; });
    } catch (_) {
      return [];
    }
  };
  window.__twinePlayerInstallInterceptors = function () {
    if (window.__twinePlayerInterceptorsInstalled) return;
    window.__twinePlayerInterceptorsInstalled = true;
    window.__twinePlayerDetectEngine();
    var originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
      var url = originalCreateObjectURL.call(this, obj);
      if (obj instanceof Blob) window.__twinePlayerBlobRegistry.set(url, obj);
      return url;
    };
    var processAnchor = function (anchor) {
      if (!anchor || !anchor.hasAttribute('download') || !anchor.href) return false;
      var blob = window.__twinePlayerBlobRegistry.get(anchor.href);
      if (blob) {
        blob.arrayBuffer().then(function (buffer) {
          var bytes = Array.from(new Uint8Array(buffer));
          window.__twinePlayerPost({ type: 'save-bytes', filename: anchor.getAttribute('download') || 'twineplayer-save.save', bytes: bytes });
        });
        return true;
      }
      return false;
    };
    var originalAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (processAnchor(this)) return;
      originalAnchorClick.call(this);
    };
    var originalInputClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') {
        window.__twinePlayerPendingLoadInput = this;
        if (window.__twinePlayerPreparingLoadFromHost) {
          window.__twinePlayerPreparingLoadFromHost = false;
        }
        window.__twinePlayerPostLoadRequest();
        return;
      }
      originalInputClick.call(this);
    };
    var resolveImagePayload = function (img, eventType) {
      var src = img.currentSrc || img.src || img.getAttribute('src') || '';
      try {
        src = new URL(src, document.baseURI).href;
      } catch (_) {}
      return {
        type: eventType,
        src: src,
        alt: img.alt || img.title || '',
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0
      };
    };
    var isInteractiveImage = function (img) {
      return !!img.closest('a, button, input, label, area, [role="button"], [onclick]');
    };
    document.addEventListener('click', function (event) {
      var img = event.target && event.target.closest ? event.target.closest('img') : null;
      if (!img || isInteractiveImage(img)) return;
      event.preventDefault();
      event.stopPropagation();
      window.__twinePlayerPost(resolveImagePayload(img, 'image-preview'));
    }, true);
    document.addEventListener('contextmenu', function (event) {
      var img = event.target && event.target.closest ? event.target.closest('img') : null;
      if (!img) return;
      event.preventDefault();
      event.stopPropagation();
      window.__twinePlayerPost(resolveImagePayload(img, 'image-context'));
    }, true);
    window.__twinePlayerLog('Twine bridge installed.', 'normal');
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.__twinePlayerIdentify();
      window.__twinePlayerInstallInterceptors();
    });
  } else {
    window.__twinePlayerIdentify();
    window.__twinePlayerInstallInterceptors();
  }
})();
''';
}
