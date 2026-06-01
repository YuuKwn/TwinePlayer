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
    'save capture prefers modern disk/base64 APIs before deprecated fallbacks',
    () {
      final script = twineBridgeScript();

      expect(
        script.indexOf('api.disk.save'),
        lessThan(script.indexOf('api.base64.save')),
      );
      expect(
        script.indexOf('api.base64.save'),
        lessThan(script.indexOf('api.serialize')),
      );
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
}
