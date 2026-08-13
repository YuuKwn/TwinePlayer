import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:twine_player_flutter/src/services/story_assistance_store.dart';

void main() {
  test(
    'per-game assistance persists and corrupt content falls back safely',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'twine-assistance-',
      );
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/story-assistance.json');
      final store = StoryAssistanceStore(file);

      expect(
        await store.loadForGame(r'C:\Games\one.html'),
        StoryAssistancePreferences.defaults,
      );
      await store.saveForGame(
        r'C:\Games\one.html',
        const StoryAssistancePreferences(
          zoomFactor: 1.4,
          enhancedChoices: true,
        ),
      );
      await store.saveForGame(
        r'C:\Games\two.html',
        const StoryAssistancePreferences(zoomFactor: 0.8),
      );
      expect(
        await store.loadForGame(r'C:\Games\one.html'),
        const StoryAssistancePreferences(
          zoomFactor: 1.4,
          enhancedChoices: true,
        ),
      );
      expect(
        await store.loadForGame(r'C:\Games\two.html'),
        const StoryAssistancePreferences(zoomFactor: 0.8),
      );

      await file.writeAsString('{bad json');
      expect(
        await store.loadForGame(r'C:\Games\one.html'),
        StoryAssistancePreferences.defaults,
      );
    },
  );

  test('zoom steps clamp at bounds and reset to one', () {
    expect(stepStoryZoom(storyZoomMaximum, 1), storyZoomMaximum);
    expect(stepStoryZoom(storyZoomMinimum, -1), storyZoomMinimum);
    expect(clampStoryZoom(9), storyZoomMaximum);
    expect(clampStoryZoom(0.1), storyZoomMinimum);
    expect(stepStoryZoom(1.3, -3), closeTo(1, 0.0001));
  });

  test('v1 files migrate to v2 without losing existing preferences', () async {
    final directory = await Directory.systemTemp.createTemp('twine-v1-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/story-assistance.json');
    await file.writeAsString(
      jsonEncode(<String, Object?>{
        'version': 1,
        'games': <String, Object?>{
          StoryAssistanceStore.gameKey(r'C:\Games\one.html'): <String, Object?>{
            'zoomFactor': 1.4,
            'enhancedChoices': true,
          },
        },
      }),
    );
    final store = StoryAssistanceStore(file);
    final loaded = await store.loadForGame(r'C:\Games\one.html');
    expect(loaded.zoomFactor, 1.4);
    expect(loaded.enhancedChoices, isTrue);
    expect(loaded.readabilityEnabled, isFalse);
    await store.saveForGame(r'C:\Games\one.html', loaded);
    final decoded = jsonDecode(await file.readAsString()) as Map;
    expect(decoded['version'], storyAssistanceSchemaVersion);
    expect((decoded['games'] as Map).isNotEmpty, isTrue);
  });

  test(
    'readability fields clamp, serialize deterministically, and reset exactly',
    () {
      final preferences = StoryAssistancePreferences.fromJson({
        'zoomFactor': 9,
        'enhancedChoices': true,
        'readabilityEnabled': true,
        'textScale': 99,
        'lineHeight': 0,
        'paragraphSpacing': double.nan,
        'readableLineLengthEnabled': true,
        'readableLineLength': 1000,
        'targetSpacing': -4,
        'unknownField': 'ignored',
      });
      expect(preferences.zoomFactor, storyZoomMaximum);
      expect(preferences.textScale, readabilityTextScaleMaximum);
      expect(preferences.lineHeight, readabilityLineHeightMinimum);
      expect(preferences.paragraphSpacing, readabilityParagraphSpacingMinimum);
      expect(preferences.readableLineLength, readabilityLineLengthMaximum);
      expect(preferences.targetSpacing, readabilityTargetSpacingMinimum);
      final json = preferences.toJson();
      expect(
        json.keys,
        containsAll(<String>[
          'zoomFactor',
          'enhancedChoices',
          'readabilityEnabled',
          'textScale',
          'lineHeight',
          'paragraphSpacing',
          'readableLineLengthEnabled',
          'readableLineLength',
          'targetSpacing',
        ]),
      );
      final reset = preferences.resetReadability();
      expect(reset.readabilityEnabled, isFalse);
      expect(reset.readableLineLengthEnabled, isFalse);
      expect(reset.textScale, StoryAssistancePreferences.defaults.textScale);
      expect(reset.lineHeight, StoryAssistancePreferences.defaults.lineHeight);
      expect(
        reset.paragraphSpacing,
        StoryAssistancePreferences.defaults.paragraphSpacing,
      );
      expect(
        reset.targetSpacing,
        StoryAssistancePreferences.defaults.targetSpacing,
      );
      expect(reset.zoomFactor, preferences.zoomFactor);
      expect(reset.enhancedChoices, preferences.enhancedChoices);
    },
  );
}
