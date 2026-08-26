import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/adaptive_controls.dart';
import 'package:twine_player_flutter/src/services/interaction_profile_store.dart';

void main() {
  testWidgets(
    'comfortable adaptive control exposes semantics and 48px target',
    (tester) async {
      final controller = InteractionProfileController(
        store: InteractionProfileStore(File('preferences-test.json')),
        initial: InteractionProfile.comfortable,
      );
      await tester.pumpWidget(
        InteractionProfileScope(
          notifier: controller,
          child: const MaterialApp(
            home: Scaffold(body: _WidgetControlFixture()),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 1));
      expect(
        tester.getSize(find.byTooltip('Save game')).height,
        greaterThanOrEqualTo(48),
      );
      expect(
        tester.getSize(find.byTooltip('More')).height,
        greaterThanOrEqualTo(44),
      );
      expect(find.bySemanticsLabel('Save game'), findsOneWidget);
    },
  );

  testWidgets('adaptive button activates once through keyboard focus', (
    tester,
  ) async {
    final controller = InteractionProfileController(
      store: InteractionProfileStore(File('preferences-test.json')),
      initial: InteractionProfile.comfortable,
    );
    var activations = 0;
    await tester.pumpWidget(
      InteractionProfileScope(
        notifier: controller,
        child: MaterialApp(
          home: Scaffold(
            body: AdaptiveIconButton(
              tooltip: 'Keyboard save',
              icon: Icons.save,
              onPressed: () => activations++,
            ),
          ),
        ),
      ),
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    expect(activations, 1);
  });

  testWidgets('adaptive buttons expose enabled state and tap semantics', (
    tester,
  ) async {
    final semanticsHandle = tester.ensureSemantics();
    try {
      final controller = InteractionProfileController(
        store: InteractionProfileStore(File('preferences-test.json')),
        initial: InteractionProfile.comfortable,
      );
      await tester.pumpWidget(
        InteractionProfileScope(
          notifier: controller,
          child: MaterialApp(
            home: Scaffold(
              body: Column(
                children: [
                  AdaptiveIconButton(
                    tooltip: 'Enabled save',
                    icon: Icons.save,
                    onPressed: () {},
                  ),
                  const AdaptiveIconButton(
                    tooltip: 'Disabled save',
                    icon: Icons.save,
                    onPressed: null,
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pump();

      final enabledLabel = find.semantics.byLabel('Enabled save');
      expect(enabledLabel, findsOneWidget);
      expect(
        enabledLabel.evaluate().single,
        isSemantics(
          label: 'Enabled save',
          isButton: true,
          hasEnabledState: true,
          isEnabled: true,
        ),
      );

      final enabled = find.byWidgetPredicate(
        (widget) => widget is IconButton && widget.tooltip == 'Enabled save',
      );
      expect(enabled, findsOneWidget);
      expect(
        tester.getSemantics(enabled),
        isSemantics(
          tooltip: 'Enabled save',
          isButton: true,
          hasEnabledState: true,
          isEnabled: true,
          hasTapAction: true,
        ),
      );

      final disabledLabel = find.semantics.byLabel('Disabled save');
      expect(disabledLabel, findsOneWidget);
      expect(
        disabledLabel.evaluate().single,
        isSemantics(
          label: 'Disabled save',
          isButton: true,
          hasEnabledState: true,
          isEnabled: false,
        ),
      );

      final disabled = find.byWidgetPredicate(
        (widget) => widget is IconButton && widget.tooltip == 'Disabled save',
      );
      expect(disabled, findsOneWidget);
      expect(
        tester.getSemantics(disabled),
        isSemantics(
          tooltip: 'Disabled save',
          isButton: true,
          hasEnabledState: true,
          isEnabled: false,
          hasTapAction: false,
        ),
      );
    } finally {
      semanticsHandle.dispose();
    }
  });
}

class _WidgetControlFixture extends StatelessWidget {
  const _WidgetControlFixture();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AdaptiveIconButton(
          tooltip: 'Save game',
          icon: Icons.save,
          highFrequency: true,
          onPressed: () {},
        ),
        AdaptiveIconButton(
          tooltip: 'More',
          icon: Icons.more_vert,
          onPressed: () {},
        ),
      ],
    );
  }
}
