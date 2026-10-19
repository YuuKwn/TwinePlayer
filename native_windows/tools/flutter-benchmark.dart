// Benchmark-only entry point. Reference Flutter implementation remains unchanged.
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import '../../flutter_app/lib/src/twine_player_app.dart';
import '../../flutter_app/lib/src/models.dart';
import '../../flutter_app/lib/src/services/history_store.dart';
import '../../flutter_app/lib/src/services/console_command_store.dart';
import '../../flutter_app/lib/src/services/game_metadata_service.dart';
import '../../flutter_app/lib/src/services/save_service.dart';
import '../../flutter_app/lib/src/services/interaction_profile_store.dart';
import '../../flutter_app/lib/src/services/input_diagnostics.dart';
import '../../flutter_app/lib/src/services/story_assistance_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final root = Platform.environment['TWINEPLAYER_BENCHMARK_ROOT'];
  final story = Platform.environment['TWINEPLAYER_BENCHMARK_STORY'];
  if (root == null || story == null || Platform.environment['WEBVIEW2_USER_DATA_FOLDER'] == null) {
    stderr.writeln('Benchmark requires explicit disposable data and browser folders.'); exit(2);
  }
  await Directory(root).create(recursive: true);
  final dependencies = TwinePlayerDependencies(
    historyStore: HistoryStore(File('$root/history.json')),
    consoleCommandStore: ConsoleCommandStore(File('$root/commands.json')),
    metadataService: GameMetadataService(), saveService: SaveService(),
    profileController: InteractionProfileController(store: InteractionProfileStore(File('$root/preferences.json'))),
    diagnostics: InputDiagnosticsRecorder(), storyAssistanceStore: StoryAssistanceStore(File('$root/assistance.json')),
  );
  runApp(TwinePlayerApp(dependencies: dependencies));
  WidgetsBinding.instance.addPostFrameCallback((_) {
    Element? library;
    void find(Element element) { if (element.widget is LibraryScreen) { library = element; return; } element.visitChildren(find); }
    WidgetsBinding.instance.rootElement!.visitChildren(find);
    if (library == null) throw StateError('Reference library did not render.');
    Navigator.of(library!).push(MaterialPageRoute<void>(builder: (_) => PlayerScreen(dependencies: dependencies, entry: LibraryEntry(path: story, title: 'Benchmark fixture', lastPlayed: DateTime.utc(2026)))));
  });
  Timer.periodic(const Duration(milliseconds: 500), (timer) async {
    if (!File('$root/stop').existsSync()) return;
    timer.cancel(); runApp(const SizedBox.shrink());
    await Future<void>.delayed(const Duration(seconds: 1)); exit(0);
  });
}
