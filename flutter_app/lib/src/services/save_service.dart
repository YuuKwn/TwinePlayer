import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:path/path.dart' as p;

import '../models.dart';

class SaveService {
  static const int maxSaveBytes = 50 * 1024 * 1024;
  static const Duration tempSaveMaxAge = Duration(hours: 24);

  Directory savesDirectory(String gamePath) {
    final parsed = p.Context(style: p.Style.platform).split(gamePath);
    if (parsed.isEmpty) {
      throw ArgumentError('Game path must include a filename');
    }
    final filename = parsed.last;
    final stem = filename.replaceFirst(
      RegExp(r'\.html?$', caseSensitive: false),
      '',
    );
    final dir = p.dirname(gamePath);
    if (stem.trim().isEmpty || dir == '.') {
      throw ArgumentError('Game path must include a directory and filename');
    }
    return Directory(p.join(dir, '${stem}_saves'));
  }

  Future<List<SaveEntry>> listSaves(String gamePath) async {
    final dir = savesDirectory(gamePath);
    if (!await dir.exists()) return <SaveEntry>[];
    final entries = <SaveEntry>[];
    await for (final entity in dir.list(followLinks: false)) {
      if (entity is! File || !entity.path.toLowerCase().endsWith('.save')) {
        continue;
      }
      final stats = await entity.stat();
      entries.add(
        SaveEntry(
          filename: p.basename(entity.path),
          size: stats.size,
          modified: stats.modified,
        ),
      );
    }
    entries.sort((a, b) => b.modified.compareTo(a.modified));
    return entries;
  }

  Future<String> writeSave(
    String gamePath,
    String filename,
    Uint8List bytes,
  ) async {
    if (bytes.isEmpty) {
      throw ArgumentError('Save data cannot be empty');
    }
    if (bytes.length > maxSaveBytes) {
      throw ArgumentError('Save data exceeds the 50 MB limit');
    }
    final dir = savesDirectory(gamePath);
    await dir.create(recursive: true);
    await cleanupStaleTempSaves(dir);
    final safeFilename = normalizeSaveFilename(filename);
    final destination = _resolveChild(dir, safeFilename);
    final temp = File(
      p.join(
        dir.path,
        '.$safeFilename.tmp-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 32)}',
      ),
    );
    try {
      await temp.writeAsBytes(bytes, flush: true);
      if (await destination.exists()) {
        await destination.delete();
      }
      await temp.rename(destination.path);
      return destination.path;
    } catch (_) {
      if (await temp.exists()) {
        await temp.delete();
      }
      rethrow;
    }
  }

  Future<Uint8List?> readSave(String gamePath, String filename) async {
    final file = _resolveChild(
      savesDirectory(gamePath),
      normalizeSaveFilename(filename),
    );
    if (!await file.exists()) return null;
    return file.readAsBytes();
  }

  Future<bool> deleteSave(String gamePath, String filename) async {
    final file = _resolveChild(
      savesDirectory(gamePath),
      normalizeSaveFilename(filename),
    );
    if (!await file.exists()) return false;
    await file.delete();
    return true;
  }

  Future<void> cleanupStaleTempSaves(Directory dir, {DateTime? now}) async {
    if (!await dir.exists()) return;
    final cutoff = now ?? DateTime.now();
    await for (final entity in dir.list(followLinks: false)) {
      if (entity is! File) continue;
      final name = p.basename(entity.path);
      if (!name.startsWith('.') || !name.contains('.tmp-')) continue;
      final modified = (await entity.stat()).modified;
      if (cutoff.difference(modified) >= tempSaveMaxAge) {
        await entity.delete();
      }
    }
  }

  File _resolveChild(Directory dir, String filename) {
    final fullPath = p.normalize(p.absolute(p.join(dir.path, filename)));
    final resolvedDir = p.normalize(p.absolute(dir.path));
    if (p.dirname(fullPath) != resolvedDir) {
      throw ArgumentError('Save path escaped the saves directory');
    }
    return File(fullPath);
  }
}

String? getSaveFilenameError(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return 'Filename is required.';
  }
  if (trimmed.contains('\x00')) {
    return 'Filename contains an invalid character.';
  }
  if (trimmed.contains('/') || trimmed.contains('\\')) {
    return 'Use a plain filename, not a path.';
  }
  if (trimmed != p.basename(trimmed)) {
    return 'Use a plain filename, not a path.';
  }
  if (!trimmed.toLowerCase().endsWith('.save')) {
    return 'Filename must end with .save.';
  }
  if (RegExp(r'[<>:"|?*]').hasMatch(trimmed)) {
    return 'Filename contains a reserved character.';
  }
  if (RegExp(
    r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)',
    caseSensitive: false,
  ).hasMatch(trimmed)) {
    return 'Filename uses a reserved Windows device name.';
  }
  return null;
}

String normalizeSaveFilename(String value) {
  final message = getSaveFilenameError(value);
  if (message != null) {
    throw ArgumentError(message);
  }
  return value.trim();
}

String formatBytes(int bytes) {
  if (bytes == 0) return '0 Bytes';
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  var size = bytes.toDouble();
  var unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size = size / 1024;
    unit++;
  }
  final value = size == size.roundToDouble()
      ? size.toStringAsFixed(0)
      : size.toStringAsFixed(2);
  return '$value ${units[unit]}';
}
