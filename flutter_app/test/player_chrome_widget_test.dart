import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forui/forui.dart';
import 'package:twine_player_flutter/src/services/interaction_profile_store.dart';
import 'package:twine_player_flutter/src/services/command_bar_preferences_store.dart';
import 'package:twine_player_flutter/src/twine_player_app.dart';
import 'package:twine_player_flutter/src/adaptive_controls.dart';

void main() {
  Widget harness({
    required Widget child,
    InteractionProfile profile = InteractionProfile.comfortable,
  }) {
    final controller = InteractionProfileController(
      store: InteractionProfileStore(File('preferences-test.json')),
      initial: profile,
    );
    final theme = profile == InteractionProfile.comfortable
        ? FThemes.zinc.dark.touch
        : FThemes.zinc.dark.desktop;
    return InteractionProfileScope(
      notifier: controller,
      child: MaterialApp(
        theme: theme.toApproximateMaterialTheme(),
        home: FTheme(
          data: theme,
          platform: FPlatformVariant.macOS,
          child: Scaffold(body: child),
        ),
      ),
    );
  }

  testWidgets(
    'comfortable command bar has visible collapse and expand handles',
    (tester) async {
      var collapsed = false;
      var consoleOpened = 0;
      await tester.pumpWidget(
        harness(
          child: StatefulBuilder(
            builder: (context, setState) => ComfortableCommandBar(
              collapsed: collapsed,
              onToggleCollapse: () => setState(() => collapsed = !collapsed),
              onBackToLibrary: () {},
              onUndo: () {},
              onSave: () {},
              onLoad: () {},
              onConsole: () => consoleOpened++,
              onMore: () {},
            ),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.byTooltip('Collapse command bar'), findsOneWidget);
      expect(find.byTooltip('Back to Library'), findsOneWidget);
      final expandedTooltips = tester
          .widgetList<AdaptiveIconButton>(find.byType(AdaptiveIconButton))
          .map((button) => button.tooltip)
          .toList();
      final consoleIndex = expandedTooltips.indexOf('Console');
      final moreIndex = expandedTooltips.indexOf('More player actions');
      expect(consoleIndex, greaterThanOrEqualTo(0));
      expect(moreIndex, consoleIndex + 1);
      expect(expandedTooltips.last, 'More player actions');
      await tester.tap(find.byTooltip('Console'));
      expect(consoleOpened, 1);
      await tester.tap(find.byTooltip('Collapse command bar'));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('Commands collapsed'), findsOneWidget);
      expect(find.byTooltip('Expand command bar'), findsOneWidget);
      await tester.tap(find.byTooltip('Expand command bar'));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.byTooltip('Save game'), findsOneWidget);
    },
  );

  testWidgets('command bar keeps pins at the edges and aligns its middle', (
    tester,
  ) async {
    Future<double> firstMiddleX(CommandBarAlignment alignment) async {
      await tester.pumpWidget(
        harness(
          child: SizedBox(
            width: 900,
            child: ComfortableCommandBar(
              collapsed: false,
              onToggleCollapse: () {},
              onBackToLibrary: () {},
              onUndo: () {},
              onSave: () {},
              onLoad: () {},
              onConsole: () {},
              onMore: () {},
              commandBarPreferences: CommandBarPreferences(
                alignment: alignment,
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      return tester.getCenter(find.byTooltip('Back to Library')).dx;
    }

    final left = await firstMiddleX(CommandBarAlignment.start);
    final center = await firstMiddleX(CommandBarAlignment.center);
    final right = await firstMiddleX(CommandBarAlignment.end);
    expect(center, greaterThan(left));
    expect(right, greaterThan(center));

    final console = tester.getRect(find.byTooltip('Console'));
    final more = tester.getRect(find.byTooltip('More player actions'));
    expect(more.center.dx, greaterThan(console.center.dx));
    final viewportWidth = tester.getSize(find.byType(Scaffold)).width;
    expect(more.right, greaterThan(viewportWidth - 50));
  });

  testWidgets('command button sizes remain reachable and are distinct', (
    tester,
  ) async {
    Future<double> consoleWidth(CommandBarSize size) async {
      await tester.pumpWidget(
        harness(
          child: ComfortableCommandBar(
            collapsed: false,
            onToggleCollapse: () {},
            onBackToLibrary: () {},
            onUndo: () {},
            onSave: () {},
            onLoad: () {},
            onConsole: () {},
            onMore: () {},
            commandBarPreferences: CommandBarPreferences(size: size),
          ),
        ),
      );
      await tester.pump();
      return tester.getSize(find.byTooltip('Console')).width;
    }

    final small = await consoleWidth(CommandBarSize.small);
    final standard = await consoleWidth(CommandBarSize.standard);
    final large = await consoleWidth(CommandBarSize.large);
    expect(small, greaterThanOrEqualTo(44));
    expect(standard, greaterThan(small));
    expect(large, greaterThan(standard));
  });

  testWidgets('command bar exposes a labeled semantic focus group', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        child: ComfortableCommandBar(
          collapsed: false,
          onToggleCollapse: () {},
          onBackToLibrary: () {},
          onUndo: () {},
          onSave: () {},
          onLoad: () {},
          onConsole: () {},
          onMore: () {},
        ),
      ),
    );
    await tester.pump();
    expect(find.bySemanticsLabel('Player command bar'), findsOneWidget);
    expect(find.byType(FocusTraversalGroup), findsWidgets);
    expect(find.byTooltip('Collapse command bar'), findsOneWidget);
    expect(find.byTooltip('Console'), findsOneWidget);
    expect(find.byTooltip('More player actions'), findsOneWidget);
  });

  testWidgets('command bar controls expose stable labels and actions', (
    tester,
  ) async {
    final semanticsHandle = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        harness(
          child: ComfortableCommandBar(
            collapsed: false,
            onToggleCollapse: () {},
            onBackToLibrary: () {},
            onUndo: () {},
            onSave: () {},
            onLoad: () {},
            onConsole: () {},
            onMore: () {},
          ),
        ),
      );
      await tester.pump();

      final commandBar = find.semantics.byLabel('Player command bar');
      expect(commandBar, findsOneWidget);
      expect(
        commandBar.evaluate().single,
        isSemantics(label: 'Player command bar'),
      );
      for (final tooltip in [
        'Collapse command bar',
        'Back to Library',
        'Undo / Back one turn',
        'Save game',
        'Load game',
        'Console',
        'More player actions',
      ]) {
        final control = find.byWidgetPredicate(
          (widget) => widget is IconButton && widget.tooltip == tooltip,
        );
        expect(control, findsOneWidget);
        expect(
          tester.getSemantics(control),
          isSemantics(
            tooltip: tooltip,
            isButton: true,
            hasEnabledState: true,
            isEnabled: true,
            hasTapAction: true,
          ),
        );
      }
    } finally {
      semanticsHandle.dispose();
    }
  });

  testWidgets('compact toolbar keeps mouse-friendly commands and semantics', (
    tester,
  ) async {
    await tester.pumpWidget(
      harness(
        profile: InteractionProfile.compact,
        child: CompactPlayerToolbar(
          title: 'Fixture Story',
          onBackToLibrary: () {},
          onUndo: () {},
          onSave: () {},
          onLoad: () {},
          onConsole: () {},
          onDevTools: () {},
          onMore: () {},
          onFullscreen: () {},
          isFullscreen: false,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 1));
    expect(find.text('Fixture Story'), findsOneWidget);
    expect(find.byTooltip('Undo / Back one turn'), findsOneWidget);
    expect(find.byTooltip('More player actions'), findsOneWidget);
    expect(find.bySemanticsLabel('Compact player toolbar'), findsOneWidget);
  });

  testWidgets('console overlay exposes its semantic region', (tester) async {
    final input = TextEditingController();
    addTearDown(input.dispose);
    await tester.pumpWidget(
      harness(
        child: SizedBox(
          height: 520,
          child: ConsolePanel(
            comfortable: true,
            inputController: input,
            logs: const <ConsoleLog>[],
            savedCommands: const <String>[],
            suggestions: const <String>[],
            onChanged: (_) {},
            onRun: (_) {},
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
    );
    await tester.pump();
    expect(find.bySemanticsLabel('Developer Console overlay'), findsOneWidget);
  });

  testWidgets('command bar Tab traversal follows source order', (tester) async {
    final rootFocus = FocusNode(debugLabel: 'command-bar-tab-root');
    addTearDown(rootFocus.dispose);
    await tester.pumpWidget(
      harness(
        child: Focus(
          focusNode: rootFocus,
          child: ComfortableCommandBar(
            collapsed: false,
            onToggleCollapse: () {},
            onBackToLibrary: () {},
            onUndo: () {},
            onSave: () {},
            onLoad: () {},
            onConsole: () {},
            onMore: () {},
          ),
        ),
      ),
    );
    await tester.pump();
    String? focusedTooltip() => FocusManager.instance.primaryFocus?.context
        ?.findAncestorWidgetOfExactType<IconButton>()
        ?.tooltip;

    rootFocus.requestFocus();
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(focusedTooltip(), 'Collapse command bar');
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(focusedTooltip(), 'Back to Library');
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(focusedTooltip(), 'Undo / Back one turn');
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(focusedTooltip(), 'Save game');
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(focusedTooltip(), 'Load game');
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(focusedTooltip(), 'Console');
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    expect(focusedTooltip(), 'More player actions');
  });

  testWidgets('compact toolbar Tab traversal follows source order', (
    tester,
  ) async {
    final rootFocus = FocusNode(debugLabel: 'compact-toolbar-tab-root');
    addTearDown(rootFocus.dispose);
    await tester.pumpWidget(
      harness(
        profile: InteractionProfile.compact,
        child: SizedBox(
          width: 640,
          child: Focus(
            focusNode: rootFocus,
            child: CompactPlayerToolbar(
              title: 'Fixture Story',
              onBackToLibrary: () {},
              onUndo: () {},
              onSave: () {},
              onLoad: () {},
              onConsole: () {},
              onDevTools: () {},
              onMore: () {},
              onFullscreen: () {},
              isFullscreen: false,
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    String? focusedTooltip() => FocusManager.instance.primaryFocus?.context
        ?.findAncestorWidgetOfExactType<IconButton>()
        ?.tooltip;

    rootFocus.requestFocus();
    await tester.pump();
    const expectedTooltips = <String>[
      'Back to Library',
      'Undo / Back one turn',
      'Save',
      'Load',
      'Enter fullscreen',
      'More player actions',
    ];
    for (final expectedTooltip in expectedTooltips) {
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      expect(focusedTooltip(), expectedTooltip);
    }
  });

  testWidgets(
    'save layout switches between one and two columns at viewport width',
    (tester) async {
      Widget preview(double width) => MaterialApp(
        home: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints.tightFor(width: width),
            child: LayoutBuilder(
              builder: (context, constraints) => Text(
                '${saveColumnCountForWidth(constraints.maxWidth)} columns',
              ),
            ),
          ),
        ),
      );
      await tester.pumpWidget(preview(520));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('1 columns'), findsOneWidget);
      await tester.pumpWidget(preview(640));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('2 columns'), findsOneWidget);
    },
  );

  test('side-by-side console width preserves a meaningful story surface', () {
    expect(consolePanelWidthFor(1200), 504);
    expect(consolePanelWidthFor(500), 260);
    expect(consolePanelWidthFor(240), 0);
    expect(consolePanelWidthFor(180), 0);
  });

  testWidgets('player content surface fills exact bounds in both profiles', (
    tester,
  ) async {
    final originalSize = tester.view.physicalSize;
    final originalDevicePixelRatio = tester.view.devicePixelRatio;
    tester.view
      ..physicalSize = const Size(1000, 600)
      ..devicePixelRatio = 1;
    addTearDown(() {
      tester.view
        ..physicalSize = originalSize
        ..devicePixelRatio = originalDevicePixelRatio;
    });
    for (final profile in [
      InteractionProfile.comfortable,
      InteractionProfile.compact,
    ]) {
      final width = profile == InteractionProfile.comfortable ? 900.0 : 640.0;
      const height = 420.0;
      await tester.pumpWidget(
        harness(
          profile: profile,
          child: SizedBox(
            width: width,
            height: height,
            child: PlayerContentSurface(
              child: ColoredBox(
                key: const ValueKey<String>('story-surface-child'),
                color: Colors.transparent,
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(
        tester.getSize(
          find.byKey(const ValueKey<String>('player-content-surface')),
        ),
        Size(width, height),
      );
      expect(
        tester.getSize(
          find.byKey(const ValueKey<String>('story-surface-child')),
        ),
        Size(width, height),
      );
    }
  });

  testWidgets(
    'content bounds stay exact with closed, overlay, and side console',
    (tester) async {
      const viewport = Size(1000, 600);
      final originalSize = tester.view.physicalSize;
      final originalDevicePixelRatio = tester.view.devicePixelRatio;
      tester.view
        ..physicalSize = viewport
        ..devicePixelRatio = 1;
      addTearDown(() {
        tester.view
          ..physicalSize = originalSize
          ..devicePixelRatio = originalDevicePixelRatio;
      });

      Widget layout({required bool overlay, required bool sideBySide}) {
        return MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: viewport.width,
              height: viewport.height,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final consoleWidth = sideBySide
                      ? consolePanelWidthFor(constraints.maxWidth)
                      : 0.0;
                  final surface = PlayerContentSurface(
                    child: const ColoredBox(color: Colors.transparent),
                  );
                  if (overlay) {
                    return Stack(
                      children: [
                        surface,
                        const Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: 180,
                          child: IgnorePointer(
                            child: ColoredBox(color: Colors.black12),
                          ),
                        ),
                      ],
                    );
                  }
                  return Row(
                    children: [
                      Expanded(child: surface),
                      if (consoleWidth > 0)
                        SizedBox(
                          key: const ValueKey<String>('side-console-pane'),
                          width: consoleWidth,
                          child: const ColoredBox(color: Colors.black12),
                        ),
                    ],
                  );
                },
              ),
            ),
          ),
        );
      }

      await tester.pumpWidget(layout(overlay: false, sideBySide: false));
      await tester.pump();
      expect(
        tester.getSize(
          find.byKey(const ValueKey<String>('player-content-surface')),
        ),
        viewport,
      );

      await tester.pumpWidget(layout(overlay: true, sideBySide: false));
      await tester.pump();
      expect(
        tester.getSize(
          find.byKey(const ValueKey<String>('player-content-surface')),
        ),
        viewport,
      );

      await tester.pumpWidget(layout(overlay: false, sideBySide: true));
      await tester.pump();
      final sideConsoleWidth = tester
          .getSize(find.byKey(const ValueKey<String>('side-console-pane')))
          .width;
      final storyWidth = tester
          .getSize(find.byKey(const ValueKey<String>('player-content-surface')))
          .width;
      expect(storyWidth, greaterThanOrEqualTo(kMinimumPlayerSurfaceWidth));
      expect(storyWidth + sideConsoleWidth, viewport.width);
    },
  );

  testWidgets('shared context surface routes activation and keyboard menu', (
    tester,
  ) async {
    var activates = 0;
    var menus = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ContextActionSurface(
            semanticLabel: 'Fixture save',
            onActivate: () => activates++,
            onMenu: () => menus++,
            child: const Text('Fixture save'),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 1));
    await tester.tap(find.text('Fixture save'));
    expect(activates, 1);
    await tester.longPress(find.text('Fixture save'));
    expect(menus, 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyDownEvent(LogicalKeyboardKey.shift);
    await tester.sendKeyEvent(LogicalKeyboardKey.f10);
    await tester.sendKeyUpEvent(LogicalKeyboardKey.shift);
    expect(menus, 2);
  });
}
