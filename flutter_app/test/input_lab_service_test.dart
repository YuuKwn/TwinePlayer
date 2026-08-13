import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/input_lab_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('fixture loader seam returns canonical offline content', () async {
    final service = InputLabService(
      loader: () async => '<html><button id="input-lab"></button></html>',
    );
    expect(await service.loadFixture(), contains('input-lab'));
  });

  test('bundled fixture contains every manual coverage marker', () async {
    final fixture = await rootBundle.loadString(InputLabService.assetPath);
    for (final marker in <String>[
      'contenteditable',
      'canvas',
      '<svg',
      'draggable="true"',
      'image-preview',
      'dynamic-choices',
      'scroll',
      'type="submit"',
      'remove-choice',
    ]) {
      expect(fixture, contains(marker));
    }
  });
}
