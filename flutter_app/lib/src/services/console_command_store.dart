import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class ConsoleCommandStore {
  ConsoleCommandStore(this._file);

  final File _file;

  static Future<ConsoleCommandStore> create() async {
    final supportDir = await getApplicationSupportDirectory();
    final appDir = Directory(p.join(supportDir.path, 'TwinePlayerFlutter'));
    await appDir.create(recursive: true);
    return ConsoleCommandStore(
      File(p.join(appDir.path, 'console-commands.json')),
    );
  }

  Future<Map<String, List<String>>> load() async {
    if (!await _file.exists()) return <String, List<String>>{};
    try {
      final decoded = jsonDecode(await _file.readAsString());
      if (decoded is! Map) return <String, List<String>>{};
      final normalized = <String, List<String>>{};
      for (final entry in decoded.entries) {
        final key = entry.key;
        final value = entry.value;
        if (key is! String || key.trim().isEmpty || value is! List) continue;
        final commands = value
            .whereType<String>()
            .map((item) => item.trim())
            .where((item) => item.isNotEmpty)
            .toList();
        if (commands.isNotEmpty) normalized[key] = commands;
      }
      return normalized;
    } catch (_) {
      return <String, List<String>>{};
    }
  }

  Future<void> save(Map<String, List<String>> commands) async {
    await _file.parent.create(recursive: true);
    await _file.writeAsString(
      const JsonEncoder.withIndent('  ').convert(commands),
    );
  }
}
