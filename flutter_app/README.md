# Twine Player Flutter

This is the Flutter Windows port of Twine Player. It keeps the non-AI core app surface:

- local Twine `.html` / `.htm` game library
- metadata extraction from Twine story data and document titles
- missing-file detection, removal, and relinking
- WebView2-based Twine playback
- sidecar save folders named `<game>_saves`
- save, load, overwrite, delete, and pagination
- developer console with command execution, autocomplete, and per-game saved commands

The Electron AI Illustrator feature is intentionally not ported on this branch.

## Development

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

The release executable is written to:

```text
build\windows\x64\runner\Release\twine_player_flutter.exe
```
