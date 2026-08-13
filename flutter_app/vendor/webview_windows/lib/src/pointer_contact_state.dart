import 'package:flutter/gestures.dart';

import 'enums.dart';

/// Tracks independent pointer contacts for the WebView surface.
///
/// Touch pointers are kept separate from mouse buttons so a cancelled touch
/// cannot leave a native WebView contact or release a mouse button belonging
/// to another pointer.
class PointerContactState {
  final Map<int, PointerDeviceKind> _kinds = <int, PointerDeviceKind>{};
  final Map<int, Offset> _positions = <int, Offset>{};
  final Map<int, PointerButton> _buttons = <int, PointerButton>{};

  int get activeTouchCount =>
      _kinds.values.where((kind) => kind == PointerDeviceKind.touch).length;

  bool isTouchPointer(int pointer) =>
      _kinds[pointer] == PointerDeviceKind.touch;

  /// Direct touch contacts are the only pointer kind this adapter forwards as
  /// WebView2 touch. Stylus/pen kinds intentionally remain on the existing
  /// mouse channel until a validated PT_PEN channel is available.
  bool isDirectTouchPointer(int pointer) => isTouchPointer(pointer);

  /// Hover events must never rewrite the last position of an active direct
  /// contact. Flutter can synthesize hover/cancel events while a contact is
  /// being cancelled or a surface is disposed.
  bool shouldForwardHover(PointerEvent event) =>
      !isDirectTouchPointer(event.pointer);

  Offset? positionFor(int pointer) => _positions[pointer];

  void registerDown(
    PointerEvent event, {
    PointerButton? button,
    Offset? position,
  }) {
    _kinds[event.pointer] = event.kind;
    _positions[event.pointer] = position ?? event.position;
    if (button != null) _buttons[event.pointer] = button;
  }

  void update(PointerEvent event, {Offset? position}) {
    if (_kinds.containsKey(event.pointer)) {
      _positions[event.pointer] = position ?? event.position;
    }
  }

  PointerButton? takeButton(int pointer) => _buttons.remove(pointer);

  void release(int pointer) {
    _kinds.remove(pointer);
    _positions.remove(pointer);
    _buttons.remove(pointer);
  }

  void clear() {
    _kinds.clear();
    _positions.clear();
    _buttons.clear();
  }
}
