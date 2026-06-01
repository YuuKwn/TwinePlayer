import 'dart:io';

class LibraryEntry {
  const LibraryEntry({
    required this.path,
    required this.title,
    required this.lastPlayed,
  });

  final String path;
  final String title;
  final DateTime lastPlayed;

  Map<String, Object?> toJson() => {
    'path': path,
    'title': title,
    'lastPlayed': lastPlayed.toUtc().toIso8601String(),
  };

  static LibraryEntry? fromJson(Object? value, {DateTime? fallbackTime}) {
    if (value is! Map) return null;
    final rawPath = value['path'];
    if (rawPath is! String || rawPath.trim().isEmpty) return null;
    final path = rawPath.trim();
    final rawTitle = value['title'];
    final title = rawTitle is String && rawTitle.trim().isNotEmpty
        ? rawTitle.trim()
        : titleFromPath(path);
    final rawDate = value['lastPlayed'];
    final parsedDate = rawDate is String ? DateTime.tryParse(rawDate) : null;

    return LibraryEntry(
      path: path,
      title: title,
      lastPlayed: (parsedDate ?? fallbackTime ?? DateTime.now()).toUtc(),
    );
  }
}

class GameMetadata {
  const GameMetadata({required this.title, required this.source});

  final String title;
  final String source;
}

class SaveEntry {
  const SaveEntry({
    required this.filename,
    required this.size,
    required this.modified,
  });

  final String filename;
  final int size;
  final DateTime modified;
}

enum LibrarySortMode { lastPlayed, title, path }

enum SaveManagerMode { save, load }

String titleFromPath(String filePath) {
  try {
    final name = filePath.split(Platform.pathSeparator).last.split('/').last;
    final clean = name
        .replaceFirst(RegExp(r'\.html?$', caseSensitive: false), '')
        .replaceAll(RegExp('[-_]'), ' ');
    final words = clean
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .map((part) => part[0].toUpperCase() + part.substring(1))
        .join(' ');
    return words.isEmpty ? 'Unknown Game' : words;
  } catch (_) {
    return 'Unknown Game';
  }
}
