import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../models.dart';

class HistoryStore {
  HistoryStore(this._file);

  final File _file;

  static Future<HistoryStore> create() async {
    final supportDir = await getApplicationSupportDirectory();
    final appDir = Directory(p.join(supportDir.path, 'TwinePlayerFlutter'));
    await appDir.create(recursive: true);
    return HistoryStore(File(p.join(appDir.path, 'library-history.json')));
  }

  Future<List<LibraryEntry>> load() async {
    if (!await _file.exists()) return <LibraryEntry>[];
    try {
      final decoded = jsonDecode(await _file.readAsString());
      if (decoded is! List) return <LibraryEntry>[];
      final now = DateTime.now().toUtc();
      final byPath = <String, LibraryEntry>{};
      for (final raw in decoded) {
        final entry = LibraryEntry.fromJson(raw, fallbackTime: now);
        if (entry == null) continue;
        final existing = byPath[entry.path];
        if (existing == null || entry.lastPlayed.isAfter(existing.lastPlayed)) {
          byPath[entry.path] = entry;
        }
      }
      return byPath.values.toList()
        ..sort((a, b) => b.lastPlayed.compareTo(a.lastPlayed));
    } catch (_) {
      return <LibraryEntry>[];
    }
  }

  Future<void> save(List<LibraryEntry> entries) async {
    await _file.parent.create(recursive: true);
    const encoder = JsonEncoder.withIndent('  ');
    await _file.writeAsString(
      encoder.convert(entries.map((entry) => entry.toJson()).toList()),
    );
  }
}
