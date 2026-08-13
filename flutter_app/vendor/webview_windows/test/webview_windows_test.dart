import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:webview_windows/src/enums.dart';
import 'package:webview_windows/src/pointer_contact_state.dart';

void main() {
  test('pointer contacts keep simultaneous touches and positions separate', () {
    final state = PointerContactState();
    state.registerDown(
      const PointerDownEvent(
        pointer: 1,
        kind: PointerDeviceKind.touch,
        position: Offset(10, 20),
      ),
      position: const Offset(1, 2),
    );
    state.registerDown(
      const PointerDownEvent(
        pointer: 2,
        kind: PointerDeviceKind.touch,
        position: Offset(30, 40),
      ),
      position: const Offset(3, 4),
    );
    expect(state.activeTouchCount, 2);
    expect(state.isTouchPointer(1), isTrue);
    expect(state.positionFor(2), const Offset(3, 4));

    state.release(1);
    expect(state.activeTouchCount, 1);
    expect(state.isTouchPointer(1), isFalse);
    expect(state.isTouchPointer(2), isTrue);
  });

  test('mouse button state is isolated and cancel cleanup is idempotent', () {
    final state = PointerContactState();
    state.registerDown(
      const PointerDownEvent(
        pointer: 4,
        kind: PointerDeviceKind.mouse,
        buttons: kPrimaryMouseButton,
      ),
      button: PointerButton.primary,
    );
    expect(state.activeTouchCount, 0);
    expect(state.takeButton(4), PointerButton.primary);
    state.release(4);
    state.release(4);
    expect(state.positionFor(4), isNull);
  });

  test('touch cancellation keeps the last tracked position', () {
    final state = PointerContactState();
    state.registerDown(
      const PointerDownEvent(
        pointer: 7,
        kind: PointerDeviceKind.touch,
        position: Offset(10, 20),
      ),
      position: const Offset(100, 120),
    );
    state.update(
      const PointerMoveEvent(
        pointer: 7,
        kind: PointerDeviceKind.touch,
        position: Offset(12, 22),
      ),
      position: const Offset(110, 130),
    );

    // A synthetic cancel can report an unrelated coordinate. The WebView
    // adapter must use positionFor(pointer) before falling back to that value.
    const syntheticCancel = Offset(999, 999);
    expect(state.positionFor(7), const Offset(110, 130));
    expect(state.positionFor(7) ?? syntheticCancel, const Offset(110, 130));
    state.release(7);
    expect(state.activeTouchCount, 0);
  });

  test('synthetic hover cannot mutate an active touch contact', () {
    final state = PointerContactState();
    state.registerDown(
      const PointerDownEvent(
        pointer: 11,
        kind: PointerDeviceKind.touch,
        position: Offset(10, 20),
      ),
      position: const Offset(100, 120),
    );
    expect(
      state.shouldForwardHover(
        const PointerHoverEvent(
          pointer: 11,
          kind: PointerDeviceKind.touch,
          position: Offset(999, 999),
        ),
      ),
      isFalse,
    );
    expect(state.positionFor(11), const Offset(100, 120));
  });

  test('stylus remains isolated from direct touch contacts', () {
    final state = PointerContactState();
    state.registerDown(
      const PointerDownEvent(
        pointer: 12,
        kind: PointerDeviceKind.stylus,
        buttons: kPrimaryMouseButton,
      ),
      button: PointerButton.primary,
    );
    expect(state.activeTouchCount, 0);
    expect(state.isDirectTouchPointer(12), isFalse);
    expect(
      state.shouldForwardHover(
        const PointerHoverEvent(
          pointer: 12,
          kind: PointerDeviceKind.stylus,
          position: Offset(3, 4),
        ),
      ),
      isTrue,
    );
    expect(state.takeButton(12), PointerButton.primary);
    state.release(12);
  });

  test('simultaneous mouse and touch contacts release independently', () {
    final state = PointerContactState();
    state.registerDown(
      const PointerDownEvent(
        pointer: 20,
        kind: PointerDeviceKind.mouse,
        buttons: kPrimaryMouseButton,
      ),
      button: PointerButton.primary,
    );
    state.registerDown(
      const PointerDownEvent(
        pointer: 21,
        kind: PointerDeviceKind.touch,
        position: Offset(21, 22),
      ),
      position: const Offset(121, 122),
    );
    expect(state.activeTouchCount, 1);

    // Lost/cancelled touch cleanup must not consume the mouse button state.
    state.release(21);
    expect(state.activeTouchCount, 0);
    expect(state.positionFor(21), isNull);
    expect(state.takeButton(20), PointerButton.primary);
    state.release(20);
  });

  test('clear is safe after lost-contact and dispose cleanup', () {
    final state = PointerContactState();
    state.registerDown(
      const PointerDownEvent(pointer: 13, kind: PointerDeviceKind.touch),
    );
    state.clear();
    state.clear();
    expect(state.activeTouchCount, 0);
    expect(state.positionFor(13), isNull);
  });
}
