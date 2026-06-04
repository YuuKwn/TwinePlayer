import 'dart:io';

import 'package:path/path.dart' as p;

String resolveWebViewImageSource({
  required String src,
  required String gamePath,
}) {
  if (RegExp(
    r'(^|/)(?:%2e|\.)(?:%2e|\.)(?:/|$)',
    caseSensitive: false,
  ).hasMatch(src)) {
    return src;
  }

  final uri = Uri.tryParse(src);
  if (uri == null ||
      (uri.scheme != 'http' && uri.scheme != 'https') ||
      uri.host.toLowerCase() != 'twineplayer.local' ||
      uri.pathSegments.isEmpty) {
    return src;
  }
  if (uri.pathSegments.any((segment) => segment == '..')) return src;

  final gameDir = File(gamePath).parent.absolute.path;
  final candidate = p.normalize(p.joinAll([gameDir, ...uri.pathSegments]));
  if (!p.equals(candidate, gameDir) && !p.isWithin(gameDir, candidate)) {
    return src;
  }

  return File(candidate).uri.toString();
}
