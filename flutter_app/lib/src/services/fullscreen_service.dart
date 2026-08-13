import 'package:flutter/services.dart';

/// Small, testable abstraction over the Windows runner's native fullscreen
/// channel. Other platforms simply keep an in-memory state and remain safe.
class FullscreenController {
  FullscreenController({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel('twine_player/window');

  final MethodChannel _channel;
  bool _isFullscreen = false;

  bool get isFullscreen => _isFullscreen;

  Future<bool> toggle() async {
    return setFullscreen(!_isFullscreen);
  }

  Future<bool> setFullscreen(bool value) async {
    try {
      final result = await _channel.invokeMethod<bool>('setFullscreen', value);
      _isFullscreen = result ?? value;
    } on MissingPluginException {
      _isFullscreen = value;
    } on PlatformException {
      // Keep the last known state if a host rejects the request.
    }
    return _isFullscreen;
  }
}
