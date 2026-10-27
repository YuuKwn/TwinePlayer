# TwinePlayer 1.1.0

This release adds per-game command shortcuts and a resizable console to the native Windows player.

- Pin a saved console command as a named sidebar button and run it while playing without opening the console. Each game keeps its own buttons across its saves. Rename or unpin from the saved-command dialog or shortcut context menu.
- History and saved commands now scroll vertically in separate panes. Drag the divider between them, or use its keyboard controls, to change how much space each list gets. The split lasts for the current app session.
- Console results remain in history and shortcut errors are visible with the console closed. Existing console panel toggles and confirmation before returning to the library remain.

For SugarCube 2, change a live story variable with `SugarCube.State.variables.money = 9000`. `State.current.variables` refers to the history moment before it was played, not the active variables.

## Install

Run `TwinePlayer-1.1.0-windows-x64-Setup.exe` to install or update the existing per-user installation. Setup retains the existing install location and native profile. Games and their adjacent `_saves` folders remain in place. Windows 11 x64 build 22621 or later and WebView2 Evergreen Runtime are required; .NET and Windows App SDK are bundled. If WebView2 is missing, the Microsoft bootstrapper requires Internet access. The application and installer are unsigned.

Alternatively extract the complete portable ZIP and run `TwinePlayer.Native.exe`. Installed and portable copies use the same native profile; close one before starting the other. Existing Flutter import remains opt-in.

## Verification

The release is built from the merged source recorded in `build-identity.json`. Native unit and UI/WebView2 checks cover per-game pins, execution, errors, vertical scrolling and resizing, along with the existing Home confirmation and console controls. The ZIP and installer include hash manifests and provenance. Physical touch, screen readers, clean-machine installation and third-party game compatibility are not certified by these automated checks.