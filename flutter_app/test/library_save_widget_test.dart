import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forui/forui.dart';
import 'package:path/path.dart' as p;
import 'package:twine_player_flutter/src/adaptive_controls.dart';
import 'package:twine_player_flutter/src/models.dart';
import 'package:twine_player_flutter/src/services/console_command_store.dart';
import 'package:twine_player_flutter/src/services/game_metadata_service.dart';
import 'package:twine_player_flutter/src/services/history_store.dart';
import 'package:twine_player_flutter/src/services/input_diagnostics.dart';
import 'package:twine_player_flutter/src/services/input_lab_service.dart';
import 'package:twine_player_flutter/src/services/interaction_profile_store.dart';
import 'package:twine_player_flutter/src/services/save_service.dart';
import 'package:twine_player_flutter/src/services/story_assistance_store.dart';
import 'package:twine_player_flutter/src/twine_player_app.dart';

void main() {
  final testRoot = Directory.systemTemp.createTempSync('twine-player-widget-');
  final commandsFile = File(p.join(testRoot.path, 'commands.json'));

  tearDownAll(() async {
    if (await testRoot.exists()) await testRoot.delete(recursive: true);
  });

  testWidgets(
    'library removal can be undone and persists the original entry',
    (tester) async {
      final originalSize = tester.view.physicalSize;
      final originalRatio = tester.view.devicePixelRatio;
      tester.view.physicalSize = const Size(800, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.physicalSize = originalSize;
        tester.view.devicePixelRatio = originalRatio;
      });
      final entry = LibraryEntry(
        path: r'C:\missing\fixture.html',
        title: 'Missing Fixture',
        lastPlayed: DateTime.utc(2026, 1, 1),
      );
      final historyStore = _FakeHistoryStore([entry]);
      final dependencies = _dependencies(historyStore, commandsFile);

      await tester.pumpWidget(
        _harness(
          LibraryScreen(dependencies: dependencies),
          wrapScaffold: false,
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Missing Fixture'), findsOneWidget);

      await tester.tap(find.byTooltip('Game actions'));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.sendKeyEvent(LogicalKeyboardKey.arrowUp);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.textContaining('Removed'), findsOneWidget);
      expect(find.text('Undo'), findsOneWidget);

      final undoButton = find.widgetWithText(AdaptiveLabelButton, 'Undo');
      tester.widget<AdaptiveLabelButton>(undoButton).onPressed!.call();
      await tester.pump(const Duration(milliseconds: 100));
      expect(historyStore.entries.single.path, entry.path);
      expect(find.text('Missing Fixture'), findsOneWidget);
    },
    timeout: const Timeout(Duration(seconds: 10)),
  );

  testWidgets(
    'Input Lab requires an explicit confirmation and does not mutate history',
    (tester) async {
      final entry = LibraryEntry(
        path: r'C:\missing\input-lab-test.html',
        title: 'Input Lab History Guard',
        lastPlayed: DateTime.utc(2026, 1, 1),
      );
      final historyStore = _FakeHistoryStore([entry]);
      final dependencies = _dependencies(historyStore, commandsFile);
      await tester.pumpWidget(
        _harness(
          LibraryScreen(dependencies: dependencies),
          wrapScaffold: false,
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.byTooltip('Settings'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Input Lab'), findsOneWidget);
      await tester.tap(find.text('Input Lab'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Open Input Lab?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Open Input Lab?'), findsNothing);
      expect(historyStore.entries, hasLength(1));
      expect(historyStore.entries.single.path, entry.path);
    },
    timeout: const Timeout(Duration(seconds: 10)),
  );

  testWidgets(
    'Input Lab launch reaches fixture PlayerScreen without writing history',
    (tester) async {
      final entry = LibraryEntry(
        path: r'C:\missing\input-lab-launch.html',
        title: 'Input Lab Launch Guard',
        lastPlayed: DateTime.utc(2026, 1, 1),
      );
      final historyStore = _FakeHistoryStore([entry]);
      final dependencies = _dependencies(
        historyStore,
        commandsFile,
        inputLabService: InputLabService(
          loader: () async => '<!doctype html><title>Input Lab test</title>',
        ),
      );
      await tester.pumpWidget(
        _harness(
          LibraryScreen(dependencies: dependencies),
          wrapScaffold: false,
        ),
      );
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.byTooltip('Settings'));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.text('Input Lab'));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.tap(find.text('Launch Input Lab'));
      await tester.pump(const Duration(milliseconds: 250));
      expect(find.byType(InputLabScreen), findsOneWidget);
      expect(historyStore.saveCount, 0);
      expect(historyStore.entries, hasLength(1));
      expect(historyStore.entries.single.path, entry.path);
      await tester.tap(find.byTooltip('Save game'));
      await tester.pump(const Duration(milliseconds: 50));
      expect(
        find.textContaining('Input Lab does not use save files'),
        findsOneWidget,
      );
      await tester.tap(find.byTooltip('Load game'));
      await tester.pump(const Duration(milliseconds: 50));
      expect(
        find.textContaining('Input Lab does not use save files'),
        findsOneWidget,
      );
      Navigator.of(tester.element(find.byType(InputLabScreen))).pop();
      await tester.pump(const Duration(milliseconds: 100));
    },
    timeout: const Timeout(Duration(seconds: 10)),
  );

  testWidgets('save overwrite asks for confirmation before writing', (
    tester,
  ) async {
    final service = _FakeSaveService(
      saves: [
        SaveEntry(
          filename: 'slot.save',
          size: 4,
          modified: DateTime.utc(2026, 1, 1),
        ),
      ],
    );
    await tester.pumpWidget(
      _harness(
        SaveManagerDialog(
          mode: SaveManagerMode.save,
          gamePath: r'C:\games\fixture.html',
          saveService: service,
          pendingSaveBytes: Uint8List.fromList([1, 2, 3]),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(EditableText), 'slot.save');
    await tester.tap(find.text('Save New'));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Overwrite save?'), findsOneWidget);
    expect(service.writeCount, 0);
    await tester.tap(find.text('Cancel'));
    await tester.pump(const Duration(milliseconds: 1));
    expect(service.writeCount, 0);
  });

  testWidgets('save context menu keeps delete confirmation', (tester) async {
    final service = _FakeSaveService(
      saves: [
        SaveEntry(
          filename: 'slot.save',
          size: 4,
          modified: DateTime.utc(2026, 1, 1),
        ),
      ],
    );
    await tester.pumpWidget(
      _harness(
        SaveManagerDialog(
          mode: SaveManagerMode.load,
          gamePath: r'C:\games\fixture.html',
          saveService: service,
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.byTooltip('Save actions'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Delete Save'), findsOneWidget);
    expect(service.deleteCount, 0);
    await tester.tap(find.text('Cancel'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(service.deleteCount, 0);
  });

  testWidgets('save manager grid switches between one and two columns', (
    tester,
  ) async {
    final originalSize = tester.view.physicalSize;
    final originalRatio = tester.view.devicePixelRatio;
    addTearDown(() {
      tester.view.physicalSize = originalSize;
      tester.view.devicePixelRatio = originalRatio;
    });
    final service = _FakeSaveService(
      saves: [
        SaveEntry(
          filename: 'one.save',
          size: 4,
          modified: DateTime.utc(2026, 1, 1),
        ),
        SaveEntry(
          filename: 'two.save',
          size: 8,
          modified: DateTime.utc(2026, 1, 2),
        ),
      ],
    );
    await tester.pumpWidget(
      _harness(
        SaveManagerDialog(
          mode: SaveManagerMode.load,
          gamePath: r'C:\games\fixture.html',
          saveService: service,
        ),
      ),
    );

    tester.view.physicalSize = const Size(520, 700);
    tester.view.devicePixelRatio = 1;
    await tester.pump(const Duration(milliseconds: 100));
    final narrowGrid = find.byKey(const ValueKey<String>('save-manager-grid'));
    expect(narrowGrid, findsOneWidget);
    final narrowDelegate = tester.widget<GridView>(narrowGrid).gridDelegate;
    expect(
      (narrowDelegate as SliverGridDelegateWithFixedCrossAxisCount)
          .crossAxisCount,
      1,
    );

    tester.view.physicalSize = const Size(800, 700);
    await tester.pump(const Duration(milliseconds: 100));
    final wideGrid = find.byKey(const ValueKey<String>('save-manager-grid'));
    final wideDelegate = tester.widget<GridView>(wideGrid).gridDelegate;
    expect(
      (wideDelegate as SliverGridDelegateWithFixedCrossAxisCount)
          .crossAxisCount,
      2,
    );
  });
}

TwinePlayerDependencies _dependencies(
  HistoryStore historyStore,
  File commandsFile, {
  InputLabService? inputLabService,
}) {
  final profileController = InteractionProfileController(
    store: InteractionProfileStore(
      File('library-save-widget-preferences.json'),
    ),
    initial: InteractionProfile.comfortable,
  );
  return TwinePlayerDependencies(
    historyStore: historyStore,
    consoleCommandStore: ConsoleCommandStore(commandsFile),
    metadataService: GameMetadataService(),
    saveService: SaveService(),
    profileController: profileController,
    diagnostics: InputDiagnosticsRecorder(),
    storyAssistanceStore: StoryAssistanceStore(
      File(p.join(commandsFile.parent.path, 'story-assistance.json')),
    ),
    inputLabService: inputLabService,
  );
}

Widget _harness(Widget child, {bool wrapScaffold = true}) {
  final theme = FThemes.zinc.dark.touch;
  final controller = InteractionProfileController(
    store: InteractionProfileStore(
      File('library-save-widget-preferences.json'),
    ),
    initial: InteractionProfile.comfortable,
  );
  return InteractionProfileScope(
    notifier: controller,
    child: MaterialApp(
      theme: theme.toApproximateMaterialTheme(),
      home: FTheme(
        data: theme,
        platform: FPlatformVariant.macOS,
        child: wrapScaffold ? Scaffold(body: child) : child,
      ),
    ),
  );
}

class _FakeSaveService extends SaveService {
  _FakeSaveService({required List<SaveEntry> saves}) : saves = [...saves];

  List<SaveEntry> saves;
  var writeCount = 0;
  var deleteCount = 0;

  @override
  Future<List<SaveEntry>> listSaves(String gamePath) async => [...saves];

  @override
  Future<String> writeSave(
    String gamePath,
    String filename,
    Uint8List bytes,
  ) async {
    writeCount++;
    return filename;
  }

  @override
  Future<bool> deleteSave(String gamePath, String filename) async {
    deleteCount++;
    saves = saves.where((save) => save.filename != filename).toList();
    return true;
  }
}

class _FakeHistoryStore extends HistoryStore {
  _FakeHistoryStore(List<LibraryEntry> entries)
    : entries = [...entries],
      super(File('unused-history.json'));

  List<LibraryEntry> entries;
  var saveCount = 0;

  @override
  Future<List<LibraryEntry>> load() async => [...entries];

  @override
  Future<void> save(List<LibraryEntry> value) async {
    saveCount++;
    entries = [...value];
  }
}
