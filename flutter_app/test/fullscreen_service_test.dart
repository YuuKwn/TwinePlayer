import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/fullscreen_service.dart';

void main() {
  test(
    'fullscreen abstraction tracks host state and supports toggle',
    () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      final channel = const MethodChannel('twine-player-test-window');
      var hostState = false;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            if (call.method == 'setFullscreen') {
              hostState = call.arguments == true;
              return hostState;
            }
            return null;
          });
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(channel, null);
      });

      final controller = FullscreenController(channel: channel);
      expect(controller.isFullscreen, isFalse);
      expect(await controller.toggle(), isTrue);
      expect(controller.isFullscreen, isTrue);
      expect(hostState, isTrue);
      expect(await controller.toggle(), isFalse);
      expect(controller.isFullscreen, isFalse);
    },
  );

  test('host failure keeps the last known fullscreen state', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final channel = const MethodChannel('twine-player-test-window-failure');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          if (call.method == 'setFullscreen' && call.arguments == false) {
            throw PlatformException(code: 'WINDOW_REJECTED');
          }
          return true;
        });
    addTearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    });

    final controller = FullscreenController(channel: channel);
    expect(await controller.setFullscreen(true), isTrue);
    expect(await controller.setFullscreen(false), isTrue);
    expect(controller.isFullscreen, isTrue);
  });
}
