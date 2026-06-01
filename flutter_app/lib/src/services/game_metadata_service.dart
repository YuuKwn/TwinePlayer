import 'dart:convert';
import 'dart:io';

import '../models.dart';

class GameMetadataService {
  static const int maxMetadataBytes = 2 * 1024 * 1024;
  static const int edgeMetadataBytes = 1024 * 1024;

  Future<GameMetadata> extract(String filePath) async {
    final file = File(filePath);
    final length = await file.length();
    if (length <= maxMetadataBytes) {
      final bytes = await _readRange(file, 0, length);
      return extractFromHtml(
        utf8.decode(bytes, allowMalformed: true),
        filePath: filePath,
      );
    }

    final head = await _readRange(file, 0, edgeMetadataBytes);
    final tailStart = length - edgeMetadataBytes;
    final tail = await _readRange(file, tailStart, length);
    return extractFromHtml(
      '${utf8.decode(head, allowMalformed: true)}\n${utf8.decode(tail, allowMalformed: true)}',
      filePath: filePath,
    );
  }

  GameMetadata extractFromHtml(String html, {String filePath = ''}) {
    final storyTag = RegExp(
      r'<tw-storydata\b[^>]*>',
      caseSensitive: false,
    ).firstMatch(html)?.group(0);
    final storyName = storyTag == null ? '' : _attribute(storyTag, 'name');
    final titleMatch = RegExp(
      r'<title[^>]*>([\s\S]*?)<\/title>',
      caseSensitive: false,
    ).firstMatch(html);
    final title = titleMatch == null
        ? ''
        : _normalize(_decodeEntities(titleMatch.group(1) ?? ''));
    final sugarCubeStoryName = _firstNonEmpty([
      _jsStringValue(html, r'Config\.saves\.id'),
      _jsStringValue(html, r'Config\.saves\.metadata\s*=\s*\{[^}]*title'),
      _jsStringValue(html, r'Story\.title'),
    ]);

    if (storyName.isNotEmpty) {
      return GameMetadata(title: storyName, source: 'tw-storydata');
    }
    if (sugarCubeStoryName.isNotEmpty) {
      return GameMetadata(title: sugarCubeStoryName, source: 'sugarcube');
    }
    if (title.isNotEmpty) {
      return GameMetadata(title: title, source: 'title');
    }
    return GameMetadata(
      title: filePath.isEmpty ? 'Unknown Game' : titleFromPath(filePath),
      source: 'filename',
    );
  }

  String _attribute(String tag, String name) {
    final match = RegExp(
      '$name\\s*=\\s*(["\'])(.*?)\\1',
      caseSensitive: false,
    ).firstMatch(tag);
    return match == null
        ? ''
        : _normalize(_decodeEntities(match.group(2) ?? ''));
  }

  Future<List<int>> _readRange(File file, int start, int end) async {
    final stream = file.openRead(start, end);
    return stream.fold<List<int>>(<int>[], (buffer, chunk) {
      buffer.addAll(chunk);
      return buffer;
    });
  }

  String _firstNonEmpty(List<String> values) {
    for (final value in values) {
      if (value.isNotEmpty) return value;
    }
    return '';
  }

  String _jsStringValue(String html, String expressionPattern) {
    final match = RegExp(
      '$expressionPattern\\s*=\\s*([\'"])(.*?)\\1',
      caseSensitive: false,
    ).firstMatch(html);
    return match == null
        ? ''
        : _normalize(_decodeEntities(match.group(2) ?? ''));
  }

  String _decodeEntities(String value) {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
  }

  String _normalize(String value) =>
      value.replaceAll(RegExp(r'\s+'), ' ').trim();
}
