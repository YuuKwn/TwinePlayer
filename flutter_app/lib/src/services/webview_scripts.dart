String twineBridgeScript() {
  return r'''
(function () {
  if (window.__twinePlayerFlutterBridgeInstalled) return;
  window.__twinePlayerFlutterBridgeInstalled = true;
  window.__twinePlayerBlobRegistry = new Map();
  window.__twinePlayerPendingLoadInput = null;
  window.__twinePlayerPreparingLoadFromHost = false;
  window.__twinePlayerLoadRequestPosted = false;
  window.__twinePlayerDiagnosticsEnabled = false;
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
  window.__twinePlayerSetDiagnosticsEnabled = function (enabled) {
    window.__twinePlayerDiagnosticsEnabled = !!enabled;
  };
  window.__twinePlayerEnhancedChoiceStyleId = 'twine-player-enhanced-choices-v1';
  window.__twinePlayerEnhancedChoiceClass = 'twine-player-enhanced-choice';
  window.__twinePlayerEnhancedChoiceMarker = 'data-twine-player-enhanced-choice';
  window.__twinePlayerEnhancedChoiceObserver = null;
  window.__twinePlayerEnhancedChoiceSelector = 'button, input:not([type="hidden"]), select, textarea, a, [role="button"], tw-link, .tw-link, .link-internal, .link-external, .macro-button';
  window.__twinePlayerEnhancedChoiceIsExcluded = function (node) {
    if (!node || node.nodeType !== 1) return true;
    try {
      var excluded = 'canvas, svg, [contenteditable], [draggable="true"], [data-draggable], [data-drag]';
      return !!node.closest(excluded) || !!node.querySelector(excluded);
    } catch (_) {
      return true;
    }
  };
  window.__twinePlayerEnhancedChoiceMark = function (root) {
    if (!root || !root.querySelectorAll) return;
    var selector = window.__twinePlayerEnhancedChoiceSelector;
    var nodes = [];
    try {
      if (root.matches && root.matches(selector)) nodes.push(root);
      nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll(selector)));
    } catch (_) {
      return;
    }
    nodes.forEach(function (node) {
      if (!window.__twinePlayerEnhancedChoiceIsExcluded(node) &&
          !node.classList.contains(window.__twinePlayerEnhancedChoiceClass)) {
        node.classList.add(window.__twinePlayerEnhancedChoiceClass);
        node.setAttribute(window.__twinePlayerEnhancedChoiceMarker, '1');
      }
    });
  };
  window.__twinePlayerEnhancedChoiceCleanup = function (root) {
    var className = window.__twinePlayerEnhancedChoiceClass;
    var marker = window.__twinePlayerEnhancedChoiceMarker;
    if (!root) return;
    var nodes = [];
    try {
      if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute(marker)) nodes.push(root);
      if (root.querySelectorAll) {
        nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll('[' + marker + ']')));
      }
    } catch (_) {
      return;
    }
    nodes.forEach(function (node) {
      if (!node || !node.classList) return;
      node.classList.remove(className);
      node.removeAttribute(marker);
    });
  };
  window.__twinePlayerSetEnhancedChoices = function (enabled) {
    var styleId = window.__twinePlayerEnhancedChoiceStyleId;
    var className = window.__twinePlayerEnhancedChoiceClass;
    var existingStyle = document.getElementById(styleId);
    if (existingStyle && existingStyle.parentNode) existingStyle.parentNode.removeChild(existingStyle);
    if (window.__twinePlayerEnhancedChoiceObserver) {
      window.__twinePlayerEnhancedChoiceObserver.disconnect();
      window.__twinePlayerEnhancedChoiceObserver = null;
    }
    window.__twinePlayerEnhancedChoiceCleanup(document);
    if (!enabled) return false;
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = '.' + className + '{box-sizing:border-box;min-height:44px;padding-top:8px;padding-bottom:8px;line-height:1.35;}a.' + className + ',tw-link.' + className + ',.tw-link.' + className + ',.link-internal.' + className + ',.link-external.' + className + ',span[role="button"].' + className + ',span.macro-button.' + className + '{display:inline-block;}';
    (document.head || document.documentElement).appendChild(style);
    var root = document.body || document.documentElement;
    window.__twinePlayerEnhancedChoiceMark(root);
    if (window.MutationObserver && root) {
      window.__twinePlayerEnhancedChoiceObserver = new MutationObserver(function (records) {
        records.forEach(function (record) {
          Array.prototype.slice.call(record.removedNodes || []).forEach(function (node) {
            window.__twinePlayerEnhancedChoiceCleanup(node);
          });
          Array.prototype.slice.call(record.addedNodes || []).forEach(function (node) {
            window.__twinePlayerEnhancedChoiceMark(node);
          });
        });
      });
      window.__twinePlayerEnhancedChoiceObserver.observe(root, { childList: true, subtree: true });
    }
    return true;
  };
  window.__twinePlayerGetEnhancedChoices = function () {
    return !!document.getElementById(window.__twinePlayerEnhancedChoiceStyleId);
  };
  window.__twinePlayerReadabilityStyleId = 'twine-player-story-assistance-v2';
  window.__twinePlayerReadabilityTextClass = 'twine-player-readability-text-v2';
  window.__twinePlayerReadabilityTargetClass = 'twine-player-readability-target-v2';
  window.__twinePlayerReadabilityRootClass = 'twine-player-readability-root-v2';
  window.__twinePlayerReadabilityMarker = 'data-twine-player-readability';
  window.__twinePlayerReadabilityObserver = null;
  window.__twinePlayerReadabilityOwnedNodes = [];
  window.__twinePlayerReadabilityStatus = {
    engine: 'unknown',
    selector: null,
    enabled: false,
    verified: false,
    stylePresent: false,
    observerPresent: false,
    markedCount: 0,
    reason: 'not-applied'
  };
  window.__twinePlayerReadabilityNumber = function (value, minimum, maximum, step, fallback) {
    var number = Number(value);
    if (!isFinite(number)) number = fallback;
    number = Math.max(minimum, Math.min(maximum, number));
    return Math.max(minimum, Math.min(maximum, number));
  };
  window.__twinePlayerReadabilityExcluded = function (node) {
    if (!node || node.nodeType !== 1) return true;
    try {
      return !!node.closest('canvas, svg, [contenteditable], [draggable="true"], [data-draggable], [data-drag]');
    } catch (_) {
      return true;
    }
  };
  window.__twinePlayerDetectReadabilityEngine = function () {
    var data = document.querySelector('tw-storydata');
    var format = (data && String(data.getAttribute('format') || '').toLowerCase()) || '';
    var engine = 'unknown';
    var selector = null;
    var reason = 'missing-story-format';
    if (format.indexOf('sugarcube') === 0) {
      engine = 'sugarcube';
      selector = '#story > #passages > .passage';
    } else if (format.indexOf('harlowe') === 0) {
      engine = 'harlowe';
      selector = 'tw-story > tw-passage';
    } else if (format.indexOf('chapbook') === 0) {
      engine = 'chapbook';
      selector = '#page > article';
    } else if (format.indexOf('snowman') === 0) {
      engine = 'snowman';
      selector = document.querySelector('#main .passage') ? '#main .passage' :
        (document.querySelector('#passage') ? '#passage' : 'tw-story > tw-passage.passage');
    } else if (window.SugarCube && document.querySelector('#story > #passages > .passage')) {
      engine = 'sugarcube';
      selector = '#story > #passages > .passage';
      reason = 'runtime-fingerprint';
    } else if (document.querySelector('#page > article') && window.Chapbook) {
      engine = 'chapbook';
      selector = '#page > article';
      reason = 'runtime-fingerprint';
    }
    if (!selector) {
      window.__twinePlayerReadabilityStatus = {
        engine: 'unknown', selector: null, enabled: false, verified: false,
        stylePresent: false, observerPresent: false, markedCount: 0, reason: reason
      };
      return window.__twinePlayerReadabilityStatus;
    }
    var roots = [];
    try { roots = Array.prototype.slice.call(document.querySelectorAll(selector)); } catch (_) { roots = []; }
    if (!roots.length) {
      window.__twinePlayerReadabilityStatus = {
        engine: 'unknown', selector: selector, enabled: false, verified: false,
        stylePresent: false, observerPresent: false, markedCount: 0,
        reason: 'verified-structure-not-rendered'
      };
      return window.__twinePlayerReadabilityStatus;
    }
    return { engine: engine, selector: selector, roots: roots, verified: true, reason: 'verified' };
  };
  window.__twinePlayerReadabilityTargetSelector = function (engine) {
    if (engine === 'sugarcube') return 'p, li, blockquote, h1, h2, h3, h4, h5, h6, button, input:not([type="hidden"]), select, textarea, a, [role="button"], .link-internal, .link-external, .macro-button';
    if (engine === 'harlowe') return 'p, li, blockquote, h1, h2, h3, h4, h5, h6, tw-link, a, button, input:not([type="hidden"]), select, textarea, [role="button"]';
    if (engine === 'chapbook') return 'p, li, blockquote, h1, h2, h3, h4, h5, h6, a, button, input:not([type="hidden"]), select, textarea, [role="button"]';
    if (engine === 'snowman') return 'p, li, blockquote, h1, h2, h3, h4, h5, h6, a, button, input:not([type="hidden"]), select, textarea, [role="button"], tw-link';
    return '';
  };
  window.__twinePlayerReadabilityCleanup = function () {
    var owned = window.__twinePlayerReadabilityOwnedNodes || [];
    var marker = window.__twinePlayerReadabilityMarker;
    owned.forEach(function (node) {
      if (!node || !node.classList || !node.hasAttribute || !node.hasAttribute(marker)) return;
      var value = node.getAttribute(marker);
      if (value === 'root' || value === 'text' || value === 'target') {
        node.classList.remove(window.__twinePlayerReadabilityTextClass);
        node.classList.remove(window.__twinePlayerReadabilityTargetClass);
        node.classList.remove(window.__twinePlayerReadabilityRootClass);
        node.removeAttribute(marker);
      }
    });
    window.__twinePlayerReadabilityOwnedNodes = [];
  };
  window.__twinePlayerReadabilityCleanupNode = function (root) {
    if (!root) return;
    var owned = window.__twinePlayerReadabilityOwnedNodes || [];
    var marker = window.__twinePlayerReadabilityMarker;
    var remaining = [];
    owned.forEach(function (node) {
      var inside = node === root || (root.contains && root.contains(node));
      if (inside && node.classList && node.hasAttribute && node.hasAttribute(marker)) {
        var value = node.getAttribute(marker);
        if (value === 'root' || value === 'text' || value === 'target') {
          node.classList.remove(window.__twinePlayerReadabilityTextClass);
          node.classList.remove(window.__twinePlayerReadabilityTargetClass);
          node.classList.remove(window.__twinePlayerReadabilityRootClass);
          node.removeAttribute(marker);
        }
      } else {
        remaining.push(node);
      }
    });
    window.__twinePlayerReadabilityOwnedNodes = remaining;
  };
  window.__twinePlayerReadabilityMark = function (node, className, markerValue) {
    if (window.__twinePlayerReadabilityExcluded(node) || !node.classList ||
        node.classList.contains(className) || node.hasAttribute(window.__twinePlayerReadabilityMarker)) return false;
    node.classList.add(className);
    node.setAttribute(window.__twinePlayerReadabilityMarker, markerValue);
    window.__twinePlayerReadabilityOwnedNodes.push(node);
    return true;
  };
  window.__twinePlayerReadabilityMarkCurrent = function (detected, config) {
    if (!detected || !detected.verified) return 0;
    var count = 0;
    var targetSelector = window.__twinePlayerReadabilityTargetSelector(detected.engine);
    detected.roots.forEach(function (root) {
      var widthSafe = true;
      try {
        widthSafe = !window.__twinePlayerReadabilityExcluded(root) &&
          !root.querySelector('canvas, svg, [contenteditable], [draggable="true"], [data-draggable], [data-drag]');
      } catch (_) { widthSafe = false; }
      // A previously safe root can become unsafe when an interactive/canvas
      // surface is inserted dynamically. Remove only the root style marker we
      // own; classes and attributes belonging to the story remain untouched.
      var marker = window.__twinePlayerReadabilityMarker;
      if (!widthSafe && root.hasAttribute && root.getAttribute(marker) === 'root') {
        root.classList.remove(window.__twinePlayerReadabilityRootClass);
        root.removeAttribute(marker);
        window.__twinePlayerReadabilityOwnedNodes =
          (window.__twinePlayerReadabilityOwnedNodes || []).filter(function (node) {
            return node !== root;
          });
      }
      if (config.readableLineLengthEnabled && widthSafe) {
        if (window.__twinePlayerReadabilityMark(root, window.__twinePlayerReadabilityRootClass, 'root')) count++;
      }
      var textNodes = [];
      try { textNodes = Array.prototype.slice.call(root.querySelectorAll(targetSelector)); } catch (_) { textNodes = []; }
      textNodes.forEach(function (node) {
        var isTarget = node.matches('button, input:not([type="hidden"]), select, textarea, a, [role="button"], tw-link, .link-internal, .link-external, .macro-button');
        if (window.__twinePlayerReadabilityMark(node, isTarget ? window.__twinePlayerReadabilityTargetClass : window.__twinePlayerReadabilityTextClass, isTarget ? 'target' : 'text')) count++;
      });
    });
    return count;
  };
  window.__twinePlayerGetStoryAssistanceStatus = function () {
    var status = window.__twinePlayerReadabilityStatus || {};
    return {
      engine: status.engine || 'unknown',
      selector: status.selector || null,
      enabled: !!status.enabled,
      verified: !!status.verified,
      stylePresent: !!document.getElementById(window.__twinePlayerReadabilityStyleId),
      observerPresent: !!window.__twinePlayerReadabilityObserver,
      markedCount: (window.__twinePlayerReadabilityOwnedNodes || []).length,
      reason: status.reason || 'unknown'
    };
  };
  window.__twinePlayerSetStoryAssistance = function (rawConfig) {
    var config = rawConfig || {};
    var enabled = !!config.enabled;
    var textScale = window.__twinePlayerReadabilityNumber(config.textScale, 0.9, 1.3, 0.05, 1);
    var lineHeight = window.__twinePlayerReadabilityNumber(config.lineHeight, 1.1, 2.0, 0.1, 1.4);
    var paragraphSpacing = window.__twinePlayerReadabilityNumber(config.paragraphSpacing, 0.5, 2.0, 0.1, 1);
    var targetSpacing = window.__twinePlayerReadabilityNumber(config.targetSpacing, 0.75, 1.75, 0.1, 1);
    var lineLengthEnabled = !!config.readableLineLengthEnabled;
    var lineLength = Math.round(window.__twinePlayerReadabilityNumber(config.readableLineLength, 45, 90, 5, 72));
    if (window.__twinePlayerReadabilityObserver) {
      window.__twinePlayerReadabilityObserver.disconnect();
      window.__twinePlayerReadabilityObserver = null;
    }
    window.__twinePlayerReadabilityCleanup();
    var oldStyle = document.getElementById(window.__twinePlayerReadabilityStyleId);
    if (oldStyle && oldStyle.parentNode) oldStyle.parentNode.removeChild(oldStyle);
    if (!enabled) {
      window.__twinePlayerReadabilityStatus = {
        engine: 'unknown', selector: null, enabled: false, verified: false,
        stylePresent: false, observerPresent: false, markedCount: 0, reason: 'disabled'
      };
      return window.__twinePlayerGetStoryAssistanceStatus();
    }
    var detected = window.__twinePlayerDetectReadabilityEngine();
    if (!detected.verified) {
      window.__twinePlayerReadabilityStatus = detected;
      return window.__twinePlayerGetStoryAssistanceStatus();
    }
    var style = document.createElement('style');
    style.id = window.__twinePlayerReadabilityStyleId;
    var textClass = window.__twinePlayerReadabilityTextClass;
    var targetClass = window.__twinePlayerReadabilityTargetClass;
    var rootClass = window.__twinePlayerReadabilityRootClass;
    style.textContent = '.' + textClass + '{font-size:calc(1em * ' + textScale + ');line-height:' + lineHeight + ';margin-bottom:calc(' + paragraphSpacing + 'em);}' +
      '.' + targetClass + '{min-height:calc(44px * ' + targetSpacing + ');padding-top:calc(8px * ' + targetSpacing + ');padding-bottom:calc(8px * ' + targetSpacing + ');}' +
      (lineLengthEnabled ? '.' + rootClass + '{max-width:' + lineLength + 'ch;margin-left:auto;margin-right:auto;}' : '');
    (document.head || document.documentElement).appendChild(style);
    var markCount = window.__twinePlayerReadabilityMarkCurrent(detected, {
      readableLineLengthEnabled: lineLengthEnabled
    });
    var observationRoot = document.body || document.documentElement;
    if (window.MutationObserver && observationRoot) {
      window.__twinePlayerReadabilityObserver = new MutationObserver(function (records) {
        var next = window.__twinePlayerDetectReadabilityEngine();
        if (!next.verified) return;
        var hasElementChange = false;
        records.forEach(function (record) {
          Array.prototype.slice.call(record.removedNodes || []).forEach(function (node) {
            window.__twinePlayerReadabilityCleanupNode(node);
            if (node && node.nodeType === 1) hasElementChange = true;
          });
          Array.prototype.slice.call(record.addedNodes || []).forEach(function (node) {
            if (node && node.nodeType === 1) hasElementChange = true;
          });
        });
        if (hasElementChange) window.__twinePlayerReadabilityMarkCurrent(next, { readableLineLengthEnabled: lineLengthEnabled });
      });
      window.__twinePlayerReadabilityObserver.observe(observationRoot, { childList: true, subtree: true });
    }
    window.__twinePlayerReadabilityStatus = {
      engine: detected.engine, selector: detected.selector, enabled: true,
      verified: true, stylePresent: true, observerPresent: !!window.__twinePlayerReadabilityObserver,
      markedCount: markCount, reason: 'applied'
    };
    return window.__twinePlayerGetStoryAssistanceStatus();
  };
  window.__twinePlayerResetStoryAssistance = function () {
    return window.__twinePlayerSetStoryAssistance({ enabled: false });
  };
  window.__twinePlayerScrollStoryPage = function (direction) {
    var sign = Number(direction) < 0 ? -1 : 1;
    var amount = Math.max((window.innerHeight || 600) * 0.82, 240);
    var scrollingElement = document.scrollingElement || document.documentElement || document.body;
    if (!scrollingElement) return { ok: false, reason: 'missing-scroll-surface' };
    try {
      scrollingElement.scrollBy({ top: sign * amount, left: 0, behavior: 'smooth' });
    } catch (_) {
      scrollingElement.scrollTop += sign * amount;
    }
    return { ok: true, direction: sign, amount: amount };
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
        var captureErrors = [];
        if (api.base64 && typeof api.base64.save === 'function') {
          try {
            var base64Save = api.base64.save();
            if (base64Save !== undefined && base64Save !== null && String(base64Save)) {
              return { ok: true, format: 'sugarcube-base64', mime: 'text/plain;charset=UTF-8', data: String(base64Save) };
            }
            captureErrors.push('Save.base64.save returned no current-state data.');
          } catch (base64Error) {
            captureErrors.push(window.__twinePlayerDescribeError(base64Error, 'Save.base64.save'));
          }
        }
        if (typeof api.serialize === 'function') {
          try {
            var serialized = api.serialize();
            if (serialized !== undefined && serialized !== null && String(serialized)) {
              return { ok: true, format: 'sugarcube-legacy-serialized', mime: 'text/plain;charset=UTF-8', data: String(serialized) };
            }
            captureErrors.push('Save.serialize returned no current-state data.');
          } catch (serializeError) {
            captureErrors.push(window.__twinePlayerDescribeError(serializeError, 'Save.serialize'));
          }
        }
        if (api.disk && typeof api.disk.save === 'function') {
          try {
            api.disk.save('twineplayer-save');
            return { ok: true, pending: true, format: 'sugarcube-disk', method: 'Save.disk.save' };
          } catch (diskError) {
            captureErrors.push(window.__twinePlayerDescribeError(diskError, 'Save.disk.save'));
          }
        }
        if (typeof api.export === 'function') {
          try {
            var htmlExport = api.export('twineplayer-save');
            if (htmlExport) return { ok: true, format: 'sugarcube-legacy-disk', mime: 'text/html;charset=UTF-8', data: String(htmlExport) };
            captureErrors.push('SugarCube native export returned no save data.');
          } catch (exportError) {
            captureErrors.push(window.__twinePlayerDescribeError(exportError, 'SugarCube native export'));
          }
        }
        if (captureErrors.length) {
          return { ok: false, error: 'SugarCube save capture failed. ' + captureErrors.join(' ') };
        }
        return { ok: false, error: 'SugarCube save capture is unavailable: no compatible save method was found.' };
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
    var reportInput = function (event, category) {
      if (!window.__twinePlayerDiagnosticsEnabled) return;
      var pointerType = event.pointerType || (category.indexOf('touch') === 0 ? 'touch' : 'mouse');
      var contacts = 0;
      try {
        contacts = event.changedTouches ? event.changedTouches.length : (event.touches ? event.touches.length : 0);
      } catch (_) {}
      if (!contacts && pointerType === 'touch') contacts = 1;
      var buttonMask = Number(event.buttons || event.button || 0);
      var buttonCount = 0;
      while (buttonMask > 0) {
        buttonCount += buttonMask & 1;
        buttonMask = Math.floor(buttonMask / 2);
      }
      window.__twinePlayerPost({
        type: 'input-diagnostic',
        kind: String(pointerType),
        category: category,
        buttons: buttonCount,
        contacts: Number(contacts || 0),
        origin: 'webview'
      });
    };
    ['pointerdown', 'pointerup', 'pointercancel'].forEach(function (name) {
      document.addEventListener(name, function (event) { reportInput(event, name); }, true);
    });
    ['touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'wheel', 'click', 'contextmenu'].forEach(function (name) {
      document.addEventListener(name, function (event) { reportInput(event, name); }, true);
    });
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
