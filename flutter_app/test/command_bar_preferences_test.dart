import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/command_bar_preferences_store.dart';

void main() {
  test('normalization pins Console before More and preserves valid order', () {
    final preferences = CommandBarPreferences(
      order: <String>[
        'more',
        'pageDown',
        'unknown',
        'console',
        'pageUp',
        'pageDown',
      ],
      pageUpEnabled: true,
      pageDownEnabled: true,
      reach: CommandBarReach.right,
    ).normalized;

    expect(preferences.order, <String>[
      'pageDown',
      'pageUp',
      'back',
      'undo',
      'save',
      'load',
      'console',
      'more',
    ]);
    expect(preferences.order.last, 'more');
    expect(preferences.order[preferences.order.length - 2], 'console');
    expect(preferences.reach, CommandBarReach.right);
  });

  test(
    'versioned store persists preferences and corrupt content resets',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'twine-command-bar-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/command-bar.json');
      final store = CommandBarPreferencesStore(file);

      expect(await store.load(), CommandBarPreferences.defaults);
      final saved = CommandBarPreferences.defaults.copyWith(
        alignment: CommandBarAlignment.end,
        size: CommandBarSize.small,
        pageDownEnabled: true,
        order: <String>['back', 'pageDown', 'console', 'more'],
      );
      await store.save(saved);
      expect(await store.load(), saved.normalized);
      final decoded = jsonDecode(await file.readAsString()) as Map;
      expect(decoded['version'], commandBarPreferencesSchemaVersion);
      expect(decoded['preferences'], isA<Map>());

      await file.writeAsString('{bad json');
      expect(await store.load(), CommandBarPreferences.defaults);
    },
  );

  test('controller updates notify and reset deterministically', () async {
    final controller = CommandBarPreferencesController(
      store: CommandBarPreferencesStore.inMemory(),
    );
    var notifications = 0;
    controller.addListener(() => notifications++);
    await controller.update(
      controller.preferences.copyWith(reach: CommandBarReach.left),
    );
    expect(controller.preferences.reach, CommandBarReach.left);
    expect(notifications, 1);
    await controller.reset();
    expect(controller.preferences, CommandBarPreferences.defaults);
    expect(notifications, 2);
  });
}
