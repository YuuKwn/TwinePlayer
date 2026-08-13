import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/models.dart';
import 'package:twine_player_flutter/src/services/game_metadata_service.dart';
import 'package:twine_player_flutter/src/services/console_command_store.dart';
import 'package:twine_player_flutter/src/services/history_store.dart';
import 'package:twine_player_flutter/src/services/input_diagnostics.dart';
import 'package:twine_player_flutter/src/services/input_lab_service.dart';
import 'package:twine_player_flutter/src/services/interaction_profile_store.dart';
import 'package:twine_player_flutter/src/services/save_service.dart';
import 'package:twine_player_flutter/src/services/story_assistance_store.dart';
import 'package:twine_player_flutter/src/twine_player_app.dart';

void main() {
  testWidgets('player can open, enter fullscreen, close, and reopen repeatedly', (
    tester,
  ) async {
    // Fixture mode only reads these stores. Use a unique, non-created child
    // path so concurrent tests cannot collide with real files; no filesystem
    // setup is needed for the bounded lifecycle loop.
    final tempDirectory = Directory(
      '${Directory.systemTemp.path}${Platform.pathSeparator}twine-player-lifecycle-soak-$pid-${DateTime.now().microsecondsSinceEpoch}',
    );
    addTearDown(() async {
      if (await tempDirectory.exists()) {
        await tempDirectory.delete(recursive: true);
      }
    });

    const pluginChannel = MethodChannel('io.jns.webview.win');
    const textureChannel = MethodChannel('io.jns.webview.win/77');
    const eventChannel = EventChannel('io.jns.webview.win/77/events');
    const fullscreenChannel = MethodChannel('twine_player/window');
    var hostFullscreen = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(pluginChannel, (call) async {
          if (call.method == 'initialize') {
            return <String, Object?>{'textureId': 77};
          }
          return null;
        });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(textureChannel, (call) async {
          if (call.method == 'executeScript') return 'null';
          if (call.method == 'addScriptToExecuteOnDocumentCreated') {
            return 'soak-script';
          }
          return null;
        });
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockStreamHandler(
          eventChannel,
          MockStreamHandler.inline(onListen: (_, _) {}, onCancel: (_) {}),
        );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(fullscreenChannel, (call) async {
          if (call.method == 'setFullscreen') {
            hostFullscreen = call.arguments == true;
            return hostFullscreen;
          }
          return null;
        });
    addTearDown(() {
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      messenger.setMockMethodCallHandler(pluginChannel, null);
      messenger.setMockMethodCallHandler(textureChannel, null);
      messenger.setMockStreamHandler(eventChannel, null);
      messenger.setMockMethodCallHandler(fullscreenChannel, null);
    });

    final dependencies = _testDependencies(tempDirectory);
    await tester.pumpWidget(
      InteractionProfileScope(
        notifier: dependencies.profileController,
        child: const MaterialApp(
          home: SizedBox(key: ValueKey<String>('library')),
        ),
      ),
    );

    for (var cycle = 0; cycle < 3; cycle++) {
      final navigator = tester.state<NavigatorState>(find.byType(Navigator));
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => PlayerScreen.inputLab(dependencies: dependencies),
        ),
      );
      await tester.pump();
      for (var frame = 0; frame < 8; frame++) {
        await tester.pump(const Duration(milliseconds: 25));
      }
      expect(find.byType(PlayerScreen), findsOneWidget);

      if (cycle == 0) {
        // A focused chrome button proves the keyboard route, then F11 enters
        // fullscreen through the same Shortcuts action used by the app.
        await tester.tap(find.byTooltip('Undo / Back one turn'));
        await tester.sendKeyEvent(LogicalKeyboardKey.f11);
      } else {
        await tester.tap(find.byTooltip('Enter fullscreen'));
      }
      await tester.pump();
      expect(hostFullscreen, isTrue, reason: 'cycle $cycle entered fullscreen');

      await tester.tap(find.byTooltip('Back to Library'));
      // MaterialPageRoute's exit transition is finite but longer than the
      // startup settle window; keep the wait bounded while covering disposal.
      for (var frame = 0; frame < 24; frame++) {
        await tester.pump(const Duration(milliseconds: 25));
      }
      expect(find.byType(PlayerScreen), findsNothing);
      expect(
        hostFullscreen,
        isFalse,
        reason: 'cycle $cycle restored the host window before disposal',
      );
    }
  });

  testWidgets(
    'player save button surfaces capture errors and opens manager with bytes',
    (tester) async {
      final tempDirectory = Directory(
        '${Directory.systemTemp.path}${Platform.pathSeparator}twine-player-save-button-$pid-${DateTime.now().microsecondsSinceEpoch}',
      );
      addTearDown(() async {
        if (await tempDirectory.exists()) {
          await tempDirectory.delete(recursive: true);
        }
      });

      const pluginChannel = MethodChannel('io.jns.webview.win');
      const textureChannel = MethodChannel('io.jns.webview.win/77');
      const eventChannel = EventChannel('io.jns.webview.win/77/events');
      const fullscreenChannel = MethodChannel('twine_player/window');
      var captureResult =
          '{"ok":false,"error":"SugarCube save capture failed."}';
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(pluginChannel, (call) async {
            if (call.method == 'initialize') {
              return <String, Object?>{'textureId': 77};
            }
            return null;
          });
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(textureChannel, (call) async {
            if (call.method == 'executeScript') {
              final script = call.arguments as String? ?? '';
              if (script.contains('__twinePlayerCaptureSave')) {
                return captureResult;
              }
              return 'null';
            }
            if (call.method == 'addScriptToExecuteOnDocumentCreated') {
              return 'save-script';
            }
            return null;
          });
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockStreamHandler(
            eventChannel,
            MockStreamHandler.inline(onListen: (_, _) {}, onCancel: (_) {}),
          );
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(fullscreenChannel, (call) async => null);
      addTearDown(() {
        final messenger =
            TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
        messenger.setMockMethodCallHandler(pluginChannel, null);
        messenger.setMockMethodCallHandler(textureChannel, null);
        messenger.setMockStreamHandler(eventChannel, null);
        messenger.setMockMethodCallHandler(fullscreenChannel, null);
      });

      final dependencies = _testDependencies(
        tempDirectory,
        initialProfile: InteractionProfile.comfortable,
      );
      final entry = LibraryEntry(
        path: '${tempDirectory.path}${Platform.pathSeparator}save-story.html',
        title: 'Save Story',
        lastPlayed: DateTime.utc(2024),
      );
      await tester.pumpWidget(
        InteractionProfileScope(
          notifier: dependencies.profileController,
          child: MaterialApp(
            home: PlayerScreen(dependencies: dependencies, entry: entry),
          ),
        ),
      );
      for (var frame = 0; frame < 8; frame++) {
        await tester.pump(const Duration(milliseconds: 25));
      }
      expect(find.byType(PlayerScreen), findsOneWidget);

      await tester.tap(find.byTooltip('Save game'));
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.textContaining('Save failed:'), findsOneWidget);

      captureResult = '{"ok":true,"format":"sugarcube-base64","data":"AQID"}';
      await tester.tap(find.byTooltip('Save game'));
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.byType(SaveManagerDialog), findsOneWidget);
      final dialog = tester.widget<SaveManagerDialog>(
        find.byType(SaveManagerDialog),
      );
      expect(dialog.pendingSaveBytes, isNotNull);
      expect(dialog.pendingSaveBytes!.toList(), utf8.encode('AQID'));

      await tester.tap(find.text('Close').last);
      await tester.pump();
      await tester.tap(find.byTooltip('Back to Library').last);
      await tester.pump(const Duration(milliseconds: 300));
    },
  );
}

TwinePlayerDependencies _testDependencies(
  Directory directory, {
  InteractionProfile initialProfile = InteractionProfile.compact,
}) {
  final profileStore = InteractionProfileStore(
    File('${directory.path}${Platform.pathSeparator}profile.json'),
  );
  return TwinePlayerDependencies(
    historyStore: HistoryStore(
      File('${directory.path}${Platform.pathSeparator}history.json'),
    ),
    consoleCommandStore: ConsoleCommandStore(
      File('${directory.path}${Platform.pathSeparator}console.json'),
    ),
    metadataService: GameMetadataService(),
    saveService: SaveService(),
    profileController: InteractionProfileController(
      store: profileStore,
      initial: initialProfile,
    ),
    diagnostics: InputDiagnosticsRecorder(),
    storyAssistanceStore: StoryAssistanceStore(
      File('${directory.path}${Platform.pathSeparator}story-assistance.json'),
    ),
    inputLabService: InputLabService(
      loader: () async => '<!doctype html><html><body>soak</body></html>',
    ),
  );
}
