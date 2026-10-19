# TwinePlayer 1.0

The first official release of the native Windows player. The WinUI 3 migration
is now the primary TwinePlayer product and the version developed going forward.
Earlier Flutter, WPF and Electron implementations remain historical sources.

## What's new

- Save, Load and Console toggle their own panels: click again to close. Save and
  Load leave the right sidebar usable, with no game/browser file dialog needed.
  Both icon-only and expanded sidebars support compact and comfortable modes.
- Returning to the library asks for confirmation, with **Stay in game** as the
  default action. Canceling preserves the current game and unsaved state.
- A new original icon combines woven story paths and a play symbol. Its SVG,
  PNG and nine-size ICO sources are included in the repository.
- Official 1.0 branding replaces preview/phase/TEST labels in the title bar,
  executable version and release packages.

The existing native player includes local HTML playback, isolated per-story
WebView2 profiles, SQLite library/history, SugarCube 1/2 sidecar Save/Load, an
opaque developer console, image previews, opt-in appearance assistance, touch
controls, fullscreen and explicit Flutter data import. Saves keep their original
engine bytes and locations. Overwrite/delete remain confirmed and writes atomic.

## Install or run

Requires Windows 11 x64 build 22621 or later. .NET and Windows App SDK are bundled.
Use `TwinePlayer-1.0.0-windows-x64-Setup.exe` for per-user installation, Start menu
access, an optional desktop shortcut and normal uninstall support. WebView2
Evergreen Runtime is reused if installed; installing it when missing needs
Internet access. Offline users can install Microsoft's x64 Evergreen Standalone
Runtime first. The application and installer are unsigned.

Alternatively extract the entire `TwinePlayer-1.0.0-windows-x64.zip` folder and
run `TwinePlayer.Native.exe`, keeping its DLLs/assets together.

Existing native data stays at `%LOCALAPPDATA%\TwinePlayer.Native`, including
libraries and story browser profiles from previews. Games and `_saves` sidecars
stay beside the original game. Uninstall preserves user data. The installer
retains the preview's upgrade identity, updates its install location in place,
and replaces old preview shortcut names. Portable and installed copies share
the native data profile; close the other copy before launching.

Flutter import stays explicit and leaves source data intact. Private games,
saves and browser profiles are excluded from all packages.

## Verification and compatibility

Focused native integration checks exercise actual toggle controls, sidebar hit
targets, native Save/Load writes and restores, cancel/no-write behavior, Home
cancel/confirm with state preservation, and existing first-use browser-dialog
suppression. Release packaging also verifies file hashes and installer lifecycle.
Exact source/build/test report identities are recorded in EXECUTION.md and the
release provenance assets.

SugarCube 1/2 save support and standard entry points are retained; arbitrary
custom save menus and browser-save bundles are not newly supported. Physical
streaming clients, screen readers, interactive setup on a clean PC and missing-
Runtime installation are not inferred from host integration checks. Previous
manual checks explicitly waived by the user remain unverified. Promotion to
1.0 is the user's product decision, not a claim of additional certification.

Release tag: `native-v1.0.0`. The old `v1.0.0` tag belongs to the historical
Electron release and is preserved. This release is published as the latest
stable TwinePlayer version.
