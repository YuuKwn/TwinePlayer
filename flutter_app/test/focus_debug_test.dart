import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/focus_debug.dart';

void main() {
  test('focus debug gate requires both requested and debug mode', () {
    const cases = <({bool requested, bool debugMode, bool enabled})>[
      (requested: false, debugMode: false, enabled: false),
      (requested: false, debugMode: true, enabled: false),
      (requested: true, debugMode: false, enabled: false),
      (requested: true, debugMode: true, enabled: true),
    ];

    for (final testCase in cases) {
      expect(
        shouldEnableTwinePlayerFocusDebug(
          requested: testCase.requested,
          debugMode: testCase.debugMode,
        ),
        testCase.enabled,
        reason:
            'requested=${testCase.requested}, '
            'debugMode=${testCase.debugMode}',
      );
    }
  });

  testWidgets('Flutter paints a focus border when the debug flag is enabled', (
    tester,
  ) async {
    final previousDebugPaintFocusBoxes = debugPaintFocusBoxes;
    addTearDown(() {
      debugPaintFocusBoxes = previousDebugPaintFocusBoxes;
    });
    debugPaintFocusBoxes = true;

    final focusNode = FocusNode(debugLabel: 'focus-debug-test');
    addTearDown(focusNode.dispose);

    try {
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Focus(
            focusNode: focusNode,
            child: const SizedBox(width: 80, height: 40),
          ),
        ),
      );

      final border = tester.widget<DecoratedBox>(
        find.descendant(
          of: find.byWidgetPredicate(
            (widget) => widget is Focus && widget.focusNode == focusNode,
          ),
          matching: find.byType(DecoratedBox),
        ),
      );
      final decoration = border.decoration as BoxDecoration;

      expect(decoration.border, isA<Border>());
      final borderStyle = decoration.border! as Border;
      expect(borderStyle.top.width, 3.0);
      expect(borderStyle.top.color, const Color(0xF000FFFF));
    } finally {
      debugPaintFocusBoxes = previousDebugPaintFocusBoxes;
    }
  });
}
