import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forui/forui.dart';
import 'package:twine_player_flutter/src/adaptive_controls.dart';
import 'package:twine_player_flutter/src/services/interaction_profile_store.dart';
import 'package:twine_player_flutter/src/twine_player_app.dart';

void main() {
  testWidgets('console command rows expose non-hover actions and menus', (
    tester,
  ) async {
    final originalSize = tester.view.physicalSize;
    final originalDevicePixelRatio = tester.view.devicePixelRatio;
    tester.view
      ..physicalSize = const Size(800, 900)
      ..devicePixelRatio = 1;
    addTearDown(() {
      tester.view
        ..physicalSize = originalSize
        ..devicePixelRatio = originalDevicePixelRatio;
    });
    final profile = InteractionProfileController(
      store: InteractionProfileStore(File('console-widget-preferences.json')),
      initial: InteractionProfile.comfortable,
    );
    final input = TextEditingController();
    var runs = 0;
    var savedDeletes = 0;
    await tester.pumpWidget(
      InteractionProfileScope(
        notifier: profile,
        child: MaterialApp(
          home: FTheme(
            data: FThemes.zinc.dark.touch,
            platform: FPlatformVariant.macOS,
            child: Scaffold(
              body: SizedBox(
                width: 800,
                height: 400,
                child: ConsolePanel(
                  comfortable: true,
                  inputController: input,
                  logs: [
                    ConsoleLog(
                      message: '> 1 + 1',
                      type: 'input',
                      timestamp: DateTime(2026),
                      command: '1 + 1',
                    ),
                  ],
                  savedCommands: const ['document.title'],
                  suggestions: const [],
                  onChanged: (_) {},
                  onRun: (_) => runs++,
                  onSave: () {},
                  onSaveCommand: (_) {},
                  onClose: () {},
                  onToggleLayout: () {},
                  isSideBySide: false,
                  onUseSaved: (_) {},
                  onDeleteSaved: (_) => savedDeletes++,
                  initialSavedCommandsExpanded: true,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));

    final actions = find.byTooltip('Console row actions');
    expect(actions, findsOneWidget);
    expect(tester.getSize(actions).height, greaterThanOrEqualTo(44));
    await tester.tap(actions);
    await tester.pump();
    expect(find.text('Run again'), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    expect(runs, 1);
    expect(find.text('Saved Commands'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 180));
    expect(find.byTooltip('Run saved command'), findsOneWidget);
    expect(find.byTooltip('Delete saved command'), findsOneWidget);
    await tester.tap(find.byTooltip('Run saved command'));
    await tester.tap(find.byTooltip('Delete saved command'));
    expect(runs, 2);
    expect(savedDeletes, 1);
  });

  testWidgets(
    'compact console keeps hover accelerators and context menu path',
    (tester) async {
      final profile = InteractionProfileController(
        store: InteractionProfileStore(File('console-widget-preferences.json')),
        initial: InteractionProfile.compact,
      );
      final input = TextEditingController();
      var runs = 0;
      await tester.pumpWidget(
        InteractionProfileScope(
          notifier: profile,
          child: MaterialApp(
            home: FTheme(
              data: FThemes.zinc.dark.desktop,
              platform: FPlatformVariant.macOS,
              child: Scaffold(
                body: SizedBox(
                  width: 800,
                  height: 600,
                  child: ConsolePanel(
                    comfortable: false,
                    inputController: input,
                    logs: [
                      ConsoleLog(
                        message: '> 2 + 2',
                        type: 'input',
                        timestamp: DateTime(2026),
                        command: '2 + 2',
                      ),
                    ],
                    savedCommands: const [],
                    suggestions: const [],
                    onChanged: (_) {},
                    onRun: (_) => runs++,
                    onSave: () {},
                    onSaveCommand: (_) {},
                    onClose: () {},
                    onToggleLayout: () {},
                    isSideBySide: false,
                    onUseSaved: (_) {},
                    onDeleteSaved: (_) {},
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));

      final command = find.text('> 2 + 2');
      final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
      await mouse.moveTo(tester.getCenter(command));
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.byTooltip('Run again'), findsOneWidget);
      expect(find.byTooltip('Save command'), findsNWidgets(2));
      final menu = find.byTooltip('Console row actions');
      expect(tester.getSize(menu).height, lessThan(44));

      final rowSurface = find.ancestor(
        of: find.text('> 2 + 2'),
        matching: find.byType(ContextActionSurface),
      );
      expect(rowSurface, findsOneWidget);
      final rowActionDetector = find.descendant(
        of: rowSurface,
        matching: find.byType(FocusableActionDetector),
      );
      expect(rowActionDetector, findsWidgets);
      final detectorFocus = find.descendant(
        of: rowActionDetector.first,
        matching: find.byType(Focus),
      );
      expect(detectorFocus, findsWidgets);
      final focusNodes = tester
          .widgetList<Focus>(detectorFocus)
          .map((focus) => focus.focusNode)
          .whereType<FocusNode>()
          .toList();
      expect(focusNodes, isNotEmpty);
      focusNodes.first.requestFocus();
      await tester.pump();
      await tester.sendKeyDownEvent(LogicalKeyboardKey.shift);
      await tester.sendKeyEvent(LogicalKeyboardKey.f10);
      await tester.sendKeyUpEvent(LogicalKeyboardKey.shift);
      await tester.pump();
      expect(find.text('Run again'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pump();

      await tester.tap(menu);
      await tester.pump();
      expect(find.text('Run again'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      expect(runs, 1);
    },
  );

  testWidgets('console panel stays within narrow responsive bounds', (
    tester,
  ) async {
    final profile = InteractionProfileController(
      store: InteractionProfileStore(File('console-widget-preferences.json')),
      initial: InteractionProfile.comfortable,
    );
    final input = TextEditingController();
    for (final comfortable in [true, false]) {
      final theme = comfortable
          ? FThemes.zinc.dark.touch
          : FThemes.zinc.dark.desktop;
      for (final size in const [
        Size(800, 600),
        Size(1024, 768),
        Size(1280, 720),
        Size(1920, 1080),
      ]) {
        await tester.pumpWidget(
          InteractionProfileScope(
            notifier: profile,
            child: MaterialApp(
              home: FTheme(
                data: theme,
                platform: FPlatformVariant.macOS,
                child: Scaffold(
                  body: SizedBox(
                    width: size.width * 0.42,
                    height: size.height,
                    child: ConsolePanel(
                      comfortable: comfortable,
                      inputController: input,
                      logs: const [],
                      savedCommands: const [],
                      suggestions: const [],
                      onChanged: (_) {},
                      onRun: (_) {},
                      onSave: () {},
                      onSaveCommand: (_) {},
                      onClose: () {},
                      onToggleLayout: () {},
                      isSideBySide: true,
                      onUseSaved: (_) {},
                      onDeleteSaved: (_) {},
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 50));
        expect(tester.takeException(), isNull);
      }
    }
  });

  testWidgets(
    'saved commands and autocomplete strips scroll by wheel and touch',
    (tester) async {
      final profile = InteractionProfileController(
        store: InteractionProfileStore(File('console-scroll-preferences.json')),
        initial: InteractionProfile.comfortable,
      );
      final input = TextEditingController();
      final saved = List<String>.generate(
        28,
        (index) => 'saved-command-$index',
      );
      final suggestions = List<String>.generate(
        28,
        (index) => 'suggestion-$index',
      );
      await tester.pumpWidget(
        InteractionProfileScope(
          notifier: profile,
          child: MaterialApp(
            home: FTheme(
              data: FThemes.zinc.dark.touch,
              platform: FPlatformVariant.macOS,
              child: Scaffold(
                body: SizedBox(
                  width: 800,
                  height: 600,
                  child: ConsolePanel(
                    comfortable: true,
                    inputController: input,
                    logs: const [],
                    savedCommands: saved,
                    suggestions: suggestions,
                    onChanged: (_) {},
                    onRun: (_) {},
                    onSave: () {},
                    onSaveCommand: (_) {},
                    onClose: () {},
                    onToggleLayout: () {},
                    isSideBySide: false,
                    onUseSaved: (_) {},
                    onDeleteSaved: (_) {},
                    initialSavedCommandsExpanded: true,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 220));

      ScrollableState scrollableState(String key) {
        final scrollable = find.descendant(
          of: find.byKey(ValueKey<String>(key)),
          matching: find.byType(Scrollable),
        );
        expect(scrollable, findsOneWidget);
        return tester.state<ScrollableState>(scrollable);
      }

      Future<void> sendWheel(String key, Offset delta) async {
        final strip = find.byKey(ValueKey<String>(key));
        final position = tester.getCenter(strip);
        await tester.sendEventToBinding(
          PointerHoverEvent(pointer: 101, position: position),
        );
        await tester.sendEventToBinding(
          PointerScrollEvent(position: position, scrollDelta: delta),
        );
        await tester.pump();
      }

      final savedState = scrollableState('console-saved-commands-scrollable');
      final savedBeforeWheel = savedState.position.pixels;
      await sendWheel(
        'console-saved-commands-scrollable',
        const Offset(0, 180),
      );
      expect(savedState.position.pixels, greaterThan(savedBeforeWheel));
      final savedBeforeTouch = savedState.position.pixels;
      final savedRect = tester.getRect(
        find.byKey(const ValueKey<String>('console-saved-commands-scrollable')),
      );
      await tester.dragFrom(
        Offset(savedRect.left + 40, savedRect.top + 24),
        const Offset(-360, 0),
        kind: PointerDeviceKind.touch,
      );
      await tester.pumpAndSettle();
      expect(savedState.position.pixels, greaterThan(savedBeforeTouch));

      final suggestionState = scrollableState('console-suggestions-scrollable');
      final suggestionBeforeWheel = suggestionState.position.pixels;
      await sendWheel('console-suggestions-scrollable', const Offset(0, 180));
      expect(
        suggestionState.position.pixels,
        greaterThan(suggestionBeforeWheel),
      );
      final suggestionBeforeTouch = suggestionState.position.pixels;
      final suggestionRect = tester.getRect(
        find.byKey(const ValueKey<String>('console-suggestions-scrollable')),
      );
      await tester.dragFrom(
        Offset(suggestionRect.left + 40, suggestionRect.top + 18),
        const Offset(-360, 0),
        kind: PointerDeviceKind.touch,
      );
      await tester.pumpAndSettle();
      expect(
        suggestionState.position.pixels,
        greaterThan(suggestionBeforeTouch),
      );
    },
  );
}
