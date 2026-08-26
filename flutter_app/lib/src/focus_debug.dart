import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

const bool twinePlayerFocusDebugRequested = bool.fromEnvironment(
  'TWINEPLAYER_FOCUS_DEBUG',
  defaultValue: false,
);

bool shouldEnableTwinePlayerFocusDebug({
  required bool requested,
  required bool debugMode,
}) {
  return requested && debugMode;
}

void configureTwinePlayerFocusDebug() {
  if (!kDebugMode) {
    return;
  }

  debugPaintFocusBoxes = shouldEnableTwinePlayerFocusDebug(
    requested: twinePlayerFocusDebugRequested,
    debugMode: kDebugMode,
  );
}
