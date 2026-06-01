import 'package:flutter/material.dart';

import 'src/twine_player_app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final dependencies = await TwinePlayerDependencies.create();
  runApp(TwinePlayerApp(dependencies: dependencies));
}
