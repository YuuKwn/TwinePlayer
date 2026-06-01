import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/game_metadata_service.dart';

void main() {
  final service = GameMetadataService();

  test('prefers tw-storydata name over document title', () {
    final metadata = service.extractFromHtml('''
<!doctype html>
<html>
<head><title>Browser Title</title></head>
<body><tw-storydata name="Story &amp; Title" ifid="ifid"></tw-storydata></body>
</html>
''');

    expect(metadata.title, 'Story & Title');
    expect(metadata.source, 'tw-storydata');
  });

  test('falls back to filename when no title metadata exists', () {
    final metadata = service.extractFromHtml(
      '<html><body>No title</body></html>',
      filePath: r'C:\Games\my-story_file.html',
    );

    expect(metadata.title, 'My Story File');
    expect(metadata.source, 'filename');
  });

  test(
    'extracts Twine story metadata when it appears after a large prefix',
    () {
      final metadata = service.extractFromHtml('''
${'x' * 128}
<tw-storydata ifid="ifid" name="Late Story Name"></tw-storydata>
''');

      expect(metadata.title, 'Late Story Name');
      expect(metadata.source, 'tw-storydata');
    },
  );
}
