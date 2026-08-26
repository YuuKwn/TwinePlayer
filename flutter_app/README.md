# Twine Player Flutter

This is the Flutter Windows port of Twine Player. It keeps the non-AI core app surface:

- local Twine `.html` / `.htm` game library
- metadata extraction from Twine story data and document titles
- missing-file detection, removal, and relinking
- WebView2-based Twine playback
- sidecar save folders named `<game>_saves`
- save, load, overwrite, delete, and pagination
- developer console with command execution, autocomplete, and per-game saved commands
- opt-in Story Assistance v2 for SugarCube, Harlowe, Chapbook, and Snowman;
  unknown formats remain untouched
- persistent command-bar alignment/order/button-size/reach preferences with
  optional Page Up/Page Down story controls

The Electron AI Illustrator feature is intentionally not ported on this branch.

## Development

The active Windows app targets Flutter 3.47.0 and Dart 3.13.0 from framework
revision `4cf24164269a5ebf0c16a028a00727d0e77bbb05`. The Windows host files
were compared with the Flutter 3.47 Windows template; the existing custom
fullscreen method channel, WebView2 integration, icon, and packaging remain in
place. The runner explicitly enables Windows Impeller through
`flutter::DartProject::set_impeller_switch(ImpellerSwitch::Enabled)`, which is
available in the target SDK's Windows `dart_project.h` API.

Use Flutter's Windows target:

```powershell
flutter pub get
flutter analyze
flutter test
flutter build windows
```

If the Flutter wrapper hangs on this Windows machine, use the SDK's direct Dart entrypoint:

```powershell
& 'C:\Users\fabio\development\flutter\bin\cache\dart-sdk\bin\dart.exe' 'C:\Users\fabio\development\flutter\packages\flutter_tools\bin\flutter_tools.dart' --no-version-check analyze
```

For the debug-only Flutter focus visualization, launch the Windows app with:

```powershell
flutter run -d windows --debug --dart-define=TWINEPLAYER_FOCUS_DEBUG=true
```

Flutter focus boxes show Flutter `Focus` nodes only; they do not visualize focus
inside the WebView DOM. The setting is selected before startup and has no
runtime toggle or release/profile effect.

The release executable is written to:

```text
build\windows\x64\runner\Release\twine_player_flutter.exe
```

Package the portable Phase 0–10 artifact (the script replaces only the exact
generated artifact directory and leaves the Phase 0–7 artifact untouched):

```powershell
.\tool\package_windows_release.ps1 -FlutterExecutable flutter -SmokeCycles 3
```

This creates `artifacts\TwinePlayer-touch-phases-0-10-windows-x64`, its ZIP,
and a SHA-256 manifest. Installer evaluation is intentionally separate; see
[`docs/installer-evaluation.md`](../docs/installer-evaluation.md).

## Input Lab and bridge runtime test

From the Library screen choose Settings → Input Lab, review the disclosure,
and press Launch Input Lab. The fixture is bundled offline, never enters
library history, and keeps diagnostics off until explicitly enabled. An
optional scenario label is sanitized, session-only, and included in copied
reports only when non-empty.
Clearing the event list preserves the scenario label for the rest of the
session; edit the field and clear it explicitly when changing hardware mode.

The Comfortable command bar keeps Console immediately before More. Console
saved-command and autocomplete strips support both touch dragging and mouse
wheel scrolling, including vertical-wheel-to-horizontal mapping.

The real generated Flutter bridge can be exercised in a headless browser from
the repository root with:

```powershell
npm run test:flutter-bridge-dom
```

Story Assistance engine fixtures and page-scroll lifecycle checks:

```powershell
npm run test:flutter-story-assistance
npm run test:windows-resilience
```
