import 'dart:io';

import 'package:flutter/gestures.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/interaction_profile_store.dart';

void main() {
  test(
    'profile store persists manual selection and falls back on corrupt JSON',
    () async {
      final directory = await Directory.systemTemp.createTemp('twine-profile-');
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/preferences.json');
      final store = InteractionProfileStore(file);

      expect(await store.load(), InteractionProfile.auto);
      await store.save(InteractionProfile.comfortable);
      expect(await store.load(), InteractionProfile.comfortable);

      await file.writeAsString('{not json');
      expect(await store.load(), InteractionProfile.auto);
    },
  );

  test('Auto changes only on trustworthy activation pointer kinds', () async {
    final directory = await Directory.systemTemp.createTemp('twine-profile-');
    addTearDown(() => directory.delete(recursive: true));
    final controller = InteractionProfileController(
      store: InteractionProfileStore(
        File('${directory.path}/preferences.json'),
      ),
    );

    expect(controller.effective, InteractionProfile.compact);
    controller.observePointer(PointerDeviceKind.touch);
    expect(controller.effective, InteractionProfile.comfortable);
    controller.observePointer(PointerDeviceKind.unknown);
    expect(controller.effective, InteractionProfile.comfortable);
    await controller.setSelected(InteractionProfile.compact);
    await controller.setSelected(InteractionProfile.auto);
    expect(controller.effective, InteractionProfile.compact);
    controller.observePointer(PointerDeviceKind.invertedStylus);
    expect(controller.effective, InteractionProfile.comfortable);
    controller.observePointer(PointerDeviceKind.touch);
    expect(controller.effective, InteractionProfile.comfortable);
    await controller.setSelected(InteractionProfile.compact);
    controller.observePointer(PointerDeviceKind.touch);
    expect(controller.effective, InteractionProfile.compact);
  });
}
