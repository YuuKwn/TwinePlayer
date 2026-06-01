import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:path/path.dart' as p;
import 'package:twine_player_flutter/src/services/save_service.dart';

void main() {
  test('normalizes safe save filenames and rejects paths', () {
    expect(normalizeSaveFilename('slot_1.save'), 'slot_1.save');
    expect(getSaveFilenameError('../slot.save'), isNotNull);
    expect(getSaveFilenameError('slot.txt'), isNotNull);
    expect(getSaveFilenameError('CON.save'), isNotNull);
  });

  test('writes, lists, reads, and deletes save sidecars', () async {
    final tempDir = await Directory.systemTemp.createTemp(
      'twine-player-save-test-',
    );
    addTearDown(() => tempDir.delete(recursive: true));

    final gamePath = p.join(tempDir.path, 'fixture.html');
    await File(gamePath).writeAsString('<html></html>');
    final service = SaveService();

    await service.writeSave(
      gamePath,
      'first.save',
      Uint8List.fromList([1, 2, 3]),
    );

    final saves = await service.listSaves(gamePath);
    expect(saves, hasLength(1));
    expect(saves.single.filename, 'first.save');
    expect(await service.readSave(gamePath, 'first.save'), [1, 2, 3]);
    expect(await service.deleteSave(gamePath, 'first.save'), isTrue);
    expect(await service.listSaves(gamePath), isEmpty);
  });
}
