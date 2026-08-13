import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

const int storyAssistanceSchemaVersion = 2;

const double storyZoomMinimum = 0.75;
const double storyZoomMaximum = 1.75;
const double storyZoomStep = 0.1;

const double readabilityTextScaleMinimum = 0.9;
const double readabilityTextScaleMaximum = 1.3;
const double readabilityTextScaleStep = 0.05;
const double readabilityLineHeightMinimum = 1.1;
const double readabilityLineHeightMaximum = 2.0;
const double readabilityLineHeightStep = 0.1;
const double readabilityParagraphSpacingMinimum = 0.5;
const double readabilityParagraphSpacingMaximum = 2.0;
const double readabilityParagraphSpacingStep = 0.1;
const double readabilityLineLengthMinimum = 45;
const double readabilityLineLengthMaximum = 90;
const double readabilityLineLengthStep = 5;
const double readabilityTargetSpacingMinimum = 0.75;
const double readabilityTargetSpacingMaximum = 1.75;
const double readabilityTargetSpacingStep = 0.1;

double _clampStepped(
  double value,
  double minimum,
  double maximum,
  double step,
) {
  if (!value.isFinite) return minimum;
  // Slider divisions provide the step in the UI. Persistence only needs to
  // bound values: keeping valid defaults such as 72ch and 1.0x intact avoids
  // surprising changes when a saved preference is loaded again.
  return value.clamp(minimum, maximum).toDouble();
}

double clampStoryZoom(double value) =>
    value.clamp(storyZoomMinimum, storyZoomMaximum).toDouble();

double stepStoryZoom(double value, int direction) => clampStoryZoom(
  (value + (storyZoomStep * direction)).clamp(
    storyZoomMinimum,
    storyZoomMaximum,
  ),
);

double clampReadabilityTextScale(double value) => _clampStepped(
  value,
  readabilityTextScaleMinimum,
  readabilityTextScaleMaximum,
  readabilityTextScaleStep,
);

double clampReadabilityLineHeight(double value) => _clampStepped(
  value,
  readabilityLineHeightMinimum,
  readabilityLineHeightMaximum,
  readabilityLineHeightStep,
);

double clampReadabilityParagraphSpacing(double value) => _clampStepped(
  value,
  readabilityParagraphSpacingMinimum,
  readabilityParagraphSpacingMaximum,
  readabilityParagraphSpacingStep,
);

double clampReadabilityLineLength(double value) => _clampStepped(
  value,
  readabilityLineLengthMinimum,
  readabilityLineLengthMaximum,
  readabilityLineLengthStep,
);

double clampReadabilityTargetSpacing(double value) => _clampStepped(
  value,
  readabilityTargetSpacingMinimum,
  readabilityTargetSpacingMaximum,
  readabilityTargetSpacingStep,
);

class StoryAssistancePreferences {
  const StoryAssistancePreferences({
    this.zoomFactor = 1,
    this.enhancedChoices = false,
    this.readabilityEnabled = false,
    this.textScale = 1,
    this.lineHeight = 1.4,
    this.paragraphSpacing = 1,
    this.readableLineLengthEnabled = false,
    this.readableLineLength = 72,
    this.targetSpacing = 1,
  });

  static const defaults = StoryAssistancePreferences();

  final double zoomFactor;
  final bool enhancedChoices;
  final bool readabilityEnabled;
  final double textScale;
  final double lineHeight;
  final double paragraphSpacing;
  final bool readableLineLengthEnabled;
  final double readableLineLength;
  final double targetSpacing;

  StoryAssistancePreferences copyWith({
    double? zoomFactor,
    bool? enhancedChoices,
    bool? readabilityEnabled,
    double? textScale,
    double? lineHeight,
    double? paragraphSpacing,
    bool? readableLineLengthEnabled,
    double? readableLineLength,
    double? targetSpacing,
  }) => StoryAssistancePreferences(
    zoomFactor: clampStoryZoom(zoomFactor ?? this.zoomFactor),
    enhancedChoices: enhancedChoices ?? this.enhancedChoices,
    readabilityEnabled: readabilityEnabled ?? this.readabilityEnabled,
    textScale: clampReadabilityTextScale(textScale ?? this.textScale),
    lineHeight: clampReadabilityLineHeight(lineHeight ?? this.lineHeight),
    paragraphSpacing: clampReadabilityParagraphSpacing(
      paragraphSpacing ?? this.paragraphSpacing,
    ),
    readableLineLengthEnabled:
        readableLineLengthEnabled ?? this.readableLineLengthEnabled,
    readableLineLength: clampReadabilityLineLength(
      readableLineLength ?? this.readableLineLength,
    ),
    targetSpacing: clampReadabilityTargetSpacing(
      targetSpacing ?? this.targetSpacing,
    ),
  );

  StoryAssistancePreferences resetReadability() => copyWith(
    readabilityEnabled: false,
    textScale: defaults.textScale,
    lineHeight: defaults.lineHeight,
    paragraphSpacing: defaults.paragraphSpacing,
    readableLineLengthEnabled: false,
    readableLineLength: defaults.readableLineLength,
    targetSpacing: defaults.targetSpacing,
  );

  StoryAssistancePreferences get normalized => copyWith();

  @override
  bool operator ==(Object other) =>
      other is StoryAssistancePreferences &&
      other.zoomFactor == zoomFactor &&
      other.enhancedChoices == enhancedChoices &&
      other.readabilityEnabled == readabilityEnabled &&
      other.textScale == textScale &&
      other.lineHeight == lineHeight &&
      other.paragraphSpacing == paragraphSpacing &&
      other.readableLineLengthEnabled == readableLineLengthEnabled &&
      other.readableLineLength == readableLineLength &&
      other.targetSpacing == targetSpacing;

  @override
  int get hashCode => Object.hash(
    zoomFactor,
    enhancedChoices,
    readabilityEnabled,
    textScale,
    lineHeight,
    paragraphSpacing,
    readableLineLengthEnabled,
    readableLineLength,
    targetSpacing,
  );

  Map<String, Object?> toJson() {
    final value = normalized;
    return <String, Object?>{
      'zoomFactor': value.zoomFactor,
      'enhancedChoices': value.enhancedChoices,
      'readabilityEnabled': value.readabilityEnabled,
      'textScale': value.textScale,
      'lineHeight': value.lineHeight,
      'paragraphSpacing': value.paragraphSpacing,
      'readableLineLengthEnabled': value.readableLineLengthEnabled,
      'readableLineLength': value.readableLineLength,
      'targetSpacing': value.targetSpacing,
    };
  }

  static StoryAssistancePreferences fromJson(Object? value) {
    if (value is! Map) return defaults;
    final zoom = value['zoomFactor'];
    final enabled = value['enhancedChoices'];
    final readability = value['readabilityEnabled'];
    final textScale = value['textScale'];
    final lineHeight = value['lineHeight'];
    final paragraphSpacing = value['paragraphSpacing'];
    final lineLengthEnabled = value['readableLineLengthEnabled'];
    final lineLength = value['readableLineLength'];
    final targetSpacing = value['targetSpacing'];
    return StoryAssistancePreferences(
      zoomFactor: zoom is num ? clampStoryZoom(zoom.toDouble()) : 1,
      enhancedChoices: enabled is bool ? enabled : false,
      readabilityEnabled: readability is bool ? readability : false,
      textScale: textScale is num
          ? clampReadabilityTextScale(textScale.toDouble())
          : defaults.textScale,
      lineHeight: lineHeight is num
          ? clampReadabilityLineHeight(lineHeight.toDouble())
          : defaults.lineHeight,
      paragraphSpacing: paragraphSpacing is num
          ? clampReadabilityParagraphSpacing(paragraphSpacing.toDouble())
          : defaults.paragraphSpacing,
      readableLineLengthEnabled: lineLengthEnabled is bool
          ? lineLengthEnabled
          : false,
      readableLineLength: lineLength is num
          ? clampReadabilityLineLength(lineLength.toDouble())
          : defaults.readableLineLength,
      targetSpacing: targetSpacing is num
          ? clampReadabilityTargetSpacing(targetSpacing.toDouble())
          : defaults.targetSpacing,
    );
  }
}

/// JSON-backed per-game story assistance. The game path is normalized into a
/// stable local key; corrupt or outdated content safely falls back to defaults.
class StoryAssistanceStore {
  StoryAssistanceStore(this.file);

  final File file;

  static Future<StoryAssistanceStore> create() async {
    final supportDir = await getApplicationSupportDirectory();
    final appDir = Directory(p.join(supportDir.path, 'TwinePlayerFlutter'));
    await appDir.create(recursive: true);
    return StoryAssistanceStore(
      File(p.join(appDir.path, 'story-assistance.json')),
    );
  }

  static String gameKey(String gamePath) =>
      p.normalize(File(gamePath).absolute.path).toLowerCase();

  Future<StoryAssistancePreferences> loadForGame(String gamePath) async {
    final games = await _readGames();
    return StoryAssistancePreferences.fromJson(games[gameKey(gamePath)]);
  }

  Future<void> saveForGame(
    String gamePath,
    StoryAssistancePreferences preferences,
  ) async {
    final games = await _readGames();
    games[gameKey(gamePath)] = preferences.toJson();
    await file.parent.create(recursive: true);
    await file.writeAsString(
      JsonEncoder.withIndent('  ').convert(<String, Object?>{
        'version': storyAssistanceSchemaVersion,
        'games': games,
      }),
    );
  }

  Future<Map<String, dynamic>> _readGames() async {
    if (!await file.exists()) return <String, dynamic>{};
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map || decoded['games'] is! Map) {
        return <String, dynamic>{};
      }
      // Version 1 and version 2 share the game map shape. Unknown top-level
      // versions are still read conservatively because known fields are
      // independently normalized by StoryAssistancePreferences.fromJson.
      return Map<String, dynamic>.from(decoded['games'] as Map);
    } catch (_) {
      return <String, dynamic>{};
    }
  }
}
