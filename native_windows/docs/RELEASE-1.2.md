# TwinePlayer 1.2.0

- Open a game or Settings directly from the library. Search retains the selection and returning from a story restores its entry. Undo is available alongside removal feedback.
- See the story title, opening progress, and save feedback in both sidebar layouts. The confirmation before leaving a story still defaults to Stay in game.
- Save and Load show filenames with separate timestamps and explain filename errors inline. Sidebar buttons still toggle the panels.
- Console actions reflect the selected command, and overlay mode fits shorter windows. Per-game shortcuts and independent resizable panes carry forward.
- Improved interaction settings, image preview, diagnostics, and Flutter import previews.
- Native Save and Load can work with some modified SugarCube 2 games that hide their public API and retain the standard game save controls. Compatibility depends on the game.

## Install

Run TwinePlayer-1.2.0-windows-x64-Setup.exe to upgrade your existing per-user install. Close TwinePlayer first. Setup keeps the install directory, native profile, game files, and adjacent saves. For portable use, extract the complete ZIP and run TwinePlayer.Native.exe.

Windows 11 x64 build 22621 or newer and WebView2 Evergreen Runtime are required. Setup can install the runtime if it is missing. Both builds include .NET and Windows App SDK. The application and installer are unsigned.

See the UX overhaul audit for design details and the release manifests for the exact source commit and checksums.
