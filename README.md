# Twine Player

Twine Player is now primarily a Flutter Windows desktop app for playing Twine HTML games outside your regular browser profile.

The Flutter app keeps the core non-AI player workflow: local library management, Twine/SugarCube metadata extraction, WebView2 playback, sidecar save files, native SugarCube save/load bridging, image previews, right-click actions, and an in-game developer console. AI Illustrator is intentionally not part of the Flutter version.

The previous Electron application still exists in this repository for legacy maintenance and remains available on the `legacy-electron` branch.

## Primary Flutter App

The Flutter app lives in [`flutter_app`](flutter_app/).

```powershell
cd flutter_app
flutter pub get
flutter run -d windows
```

If the Flutter wrapper hangs on this Windows machine, use the SDK's direct Dart entrypoint:

```powershell
& 'C:\Users\fabio\development\flutter\bin\cache\dart-sdk\bin\dart.exe' 'C:\Users\fabio\development\flutter\packages\flutter_tools\bin\flutter_tools.dart' --no-version-check run -d windows
```

## Check

```powershell
cd flutter_app
flutter analyze
flutter test
```

## Build

```powershell
cd flutter_app
flutter build windows
```

Build output:

```text
flutter_app\build\windows\x64\runner\Release\twine_player_flutter.exe
```

## Features

- Game library with metadata extraction, search, sort, missing-file detection, relink support, and right-click actions.
- WebView2-based player for Twine `.html` and `.htm` games.
- Sidecar save folders named `<game>_saves/`.
- SugarCube save/load bridge that opens the native SugarCube saves dialog before injecting selected TwinePlayer saves.
- Developer console with command history, rerun/save actions, autocomplete, and collapsible saved commands.
- Clickable expanded image previews for Twine game images.
- Flutter Windows UI with compact Fluent-inspired layout.
- Story Assistance v2 is opt-in and engine-verified for the four official
  Twine formats; unknown or excluded surfaces remain untouched.
- Comfortable command-bar preferences persist across games. Console is pinned
  immediately before More, More is rightmost, and Page Up/Page Down are
  optional story-scroll controls (no edge gestures or global shortcuts).

## Phase 10 portable artifact

The release candidate version is `1.0.0+10`. From `flutter_app`, run
`tool\package_windows_release.ps1 -SmokeCycles 3` to build the portable
`artifacts\TwinePlayer-touch-phases-0-10-windows-x64` folder, ZIP, and manifest.
The existing Phase 0–7 artifact is preserved. Installer, signing, auto-update,
telemetry, and publishing remain separate authorizations.

## Legacy Electron App

The Electron app is retained for legacy use on the `legacy-electron` branch. It includes the old optional AI Illustrator workflow and Electron packaging scripts.

The Electron source files may still be present on this branch while the Flutter migration settles, but the supported app entrypoint is now `flutter_app`.

## License

ISC
