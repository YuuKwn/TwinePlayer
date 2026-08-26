import 'package:flutter/material.dart';

import 'src/focus_debug.dart';
import 'src/twine_player_app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  configureTwinePlayerFocusDebug();
  final dependencies = await TwinePlayerDependencies.create();
  runApp(TwinePlayerApp(dependencies: dependencies));
}
