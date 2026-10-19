import 'dart:io';
import '../../flutter_app/lib/src/services/save_service.dart';

// Generates a compatibility fixture using the unchanged Flutter SaveService.
// Invoke only against the integration runner's disposable game copy.
Future<void> main(List<String> args) async {
  if (args.length != 3) throw ArgumentError('Expected game path, payload file, and save filename.');
  final path = await SaveService().writeSave(args[0], args[2], await File(args[1]).readAsBytes());
  stdout.writeln('Flutter SaveService created: $path');
}
