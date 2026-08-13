import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/webview_scripts.dart';

void main() {
  test('bridge includes image preview and context-menu messages', () {
    final script = twineBridgeScript();

    expect(script, contains('image-preview'));
    expect(script, contains('image-context'));
    expect(script, contains('contextmenu'));
  });

  test(
    'save capture prefers direct Base64 and legacy state before disk fallback',
    () {
      final script = twineBridgeScript();

      expect(
        script.indexOf('api.base64.save'),
        lessThan(script.indexOf('api.serialize')),
      );
      expect(
        script.indexOf('api.serialize'),
        lessThan(script.indexOf('api.disk.save')),
      );
      expect(script, isNot(contains('api.base64.export')));
      expect(
        script.indexOf('api.base64.load'),
        lessThan(script.indexOf('api.deserialize')),
      );
    },
  );

  test('async SugarCube load reports pending synchronously', () {
    final script = twineBridgeScript();

    expect(script, contains('__twinePlayerHandleLoadPromise'));
    expect(script, contains('pending: true'));
    expect(script, isNot(contains('async function (text)')));
  });

  test('native SugarCube load bridge captures a file input', () {
    final script = twineBridgeScript();

    expect(script, contains('__twinePlayerPrepareNativeLoad'));
    expect(script, contains('__twinePlayerPendingLoadInput'));
    expect(script, contains('sc.UI.saves'));
    expect(script, contains('loadInput.dispatchEvent'));
    expect(script, contains('__twinePlayerCloseNativeSaveDialog'));
  });

  test('bridge leaves regular game inputs and non-image clicks alone', () {
    final script = twineBridgeScript();

    expect(script, contains("if (this.type === 'file')"));
    expect(script, contains('originalInputClick.call(this)'));
    expect(script, contains('if (!img || isInteractiveImage(img)) return;'));
  });

  test('bridge diagnostics are opt-in and sanitized', () {
    final script = twineBridgeScript();

    expect(script, contains('__twinePlayerDiagnosticsEnabled = false'));
    expect(script, contains('__twinePlayerSetDiagnosticsEnabled'));
    expect(script, contains("type: 'input-diagnostic'"));
    expect(script, contains("origin: 'webview'"));
    expect(script, contains('changedTouches'));
    expect(
      script,
      contains('if (!window.__twinePlayerDiagnosticsEnabled) return;'),
    );
    expect(script, contains('buttonCount'));
    expect(script, isNot(contains("'pointermove'")));
  });

  test('enhanced choices are namespaced, opt-in, idempotent, and removable', () {
    final script = twineBridgeScript();

    expect(script, contains('__twinePlayerSetEnhancedChoices'));
    expect(script, contains('twine-player-enhanced-choices-v1'));
    expect(script, contains('twine-player-enhanced-choice'));
    expect(script, contains('MutationObserver'));
    expect(script, contains('disconnect()'));
    expect(script, contains('__twinePlayerEnhancedChoiceMarker'));
    expect(script, contains('__twinePlayerEnhancedChoiceCleanup'));
    expect(script, contains('classList.remove(className)'));
    expect(script, contains('button, input:not([type="hidden"]), select'));
    expect(script, contains('tw-link'));
    expect(script, contains('[contenteditable]'));
    expect(script, contains('[draggable="true"]'));
    expect(script, contains('canvas, svg'));
    expect(
      script,
      contains('node.closest(excluded) || !!node.querySelector(excluded)'),
    );
    expect(
      script,
      contains(
        'box-sizing:border-box;min-height:44px;padding-top:8px;padding-bottom:8px;',
      ),
    );
    expect(script, contains("a.' + className + '"));
    expect(script, contains("span[role=\"button\"].' + className + '"));
    expect(script, contains("span.macro-button.' + className + '"));
    expect(script, contains('{display:inline-block;}'));
    final styleStart = script.indexOf('style.textContent =');
    final styleEnd = script.indexOf("';", styleStart);
    expect(styleStart, greaterThanOrEqualTo(0));
    expect(styleEnd, greaterThan(styleStart));
    expect(script.substring(styleStart, styleEnd), isNot(contains('width')));
    expect(script, contains('record.addedNodes'));
    expect(script, contains('record.removedNodes'));
    expect(
      script,
      isNot(contains('window.__twinePlayerEnhancedChoiceMark(record.target)')),
    );
    expect(script, contains('if (!enabled) return false;'));
  });

  test(
    'story assistance v2 has bounded engine-aware lifecycle and safe teardown',
    () {
      final script = twineBridgeScript();

      expect(script, contains('__twinePlayerDetectReadabilityEngine'));
      expect(script, contains('__twinePlayerSetStoryAssistance'));
      expect(script, contains('__twinePlayerResetStoryAssistance'));
      expect(script, contains('__twinePlayerGetStoryAssistanceStatus'));
      expect(script, contains('__twinePlayerScrollStoryPage'));
      expect(script, contains('twine-player-story-assistance-v2'));
      expect(script, contains('data-twine-player-readability'));
      expect(script, contains('#story > #passages > .passage'));
      expect(script, contains('tw-story > tw-passage'));
      expect(script, contains('#page > article'));
      expect(script, contains('#main .passage'));
      expect(script, contains('font-size:calc(1em * '));
      expect(script, contains('line-height:'));
      expect(script, contains('margin-bottom:calc('));
      expect(script, contains('max-width:'));
      expect(script, isNot(contains('font-family')));
      expect(script, isNot(contains('animation:')));
      expect(script, isNot(contains('transition:')));
      expect(script, contains('ReadabilityObserver.disconnect()'));
      expect(script, contains('readableLineLengthEnabled'));
      expect(script, contains('window.__twinePlayerReadabilityOwnedNodes'));
    },
  );
}
