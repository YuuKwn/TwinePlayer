# UX Preview 5 installer

The installer is a per-user Windows 11 x64 installer for the published
`native-v0.9.0-ux5` preview. It wraps the exact approved portable application;
it does not rebuild, rename or change the app's TEST/preview identity.

Setup defaults to `%LOCALAPPDATA%\Programs\TwinePlayer Native`, adds a Start
menu shortcut and an Apps > Installed apps entry, and offers an optional desktop
shortcut. It requires Windows 11 build 22621 or later. .NET and Windows App SDK
are already included. Microsoft Edge WebView2 Evergreen Runtime is detected in
the documented user/machine registry locations. If missing, Setup runs the
bundled, Microsoft-signed Evergreen bootstrapper before installing the app.
That step needs Internet access. For offline setup, install Microsoft's x64
Evergreen Standalone Runtime first. Existing Runtime installations are reused.

Re-running Setup updates the same installation. Close TwinePlayer before
upgrading or uninstalling; Setup also uses Windows Restart Manager to detect
files in use. Uninstall removes installer-owned files and shortcuts, while
preserving `%LOCALAPPDATA%\TwinePlayer.Native`, external games and sidecar saves.
It leaves the shared WebView2 Runtime installed. Use a dedicated app directory,
and keep personal games outside it. A portable copy and installed copy use the
same native user profile; do not run them simultaneously against that profile.

The setup executable and application are unsigned. No certificate, file
association, background updater or automatic migration is added.

## Build

Use the official [Inno Setup 7.1.0 x64 compiler](https://jrsoftware.org/isdl.php)
(portable mode is supported by its own setup) and Microsoft's
[WebView2 Evergreen bootstrapper](https://go.microsoft.com/fwlink/p/?LinkId=2124703).
The wrapper verifies both publisher signatures and every payload manifest entry,
rejects unlisted files, and refuses to overwrite an existing setup executable.
The compiler download used for this release has SHA-256
`0362A383ED217D4C4239B5933866DD96D3EB2102737DA92F80F6057A4B40DF2F`.

```powershell
.\native_windows\tools\package-installer.ps1 `
  -PayloadDirectory 'C:\build\TwinePlayer-Native-phase-9-TEST-20261018-ux5-windows-x64' `
  -CompilerPath 'C:\tools\Inno Setup 7\ISCC.exe' `
  -BootstrapperPath 'C:\tools\MicrosoftEdgeWebview2Setup.exe' `
  -OutputDirectory 'C:\build\installer' -ReleaseTag 'native-v0.9.0-ux5'
```

Outputs: setup EXE, SHA-256 text file and JSON provenance recording the original
application identity, installer source hashes, compiler and bootstrapper hashes.
The release's original ZIP/manifest/provenance stay unchanged.

## Verification

`tools/test-installer.ps1 -Installer <setup.exe>` exercises the actual shipping
installer in an isolated directory with spaces in its name. It refuses to run
if the native install identity or shortcuts already exist. It checks install
and reinstall, all application manifest hashes, uninstall registration, Start
menu/desktop shortcut targets, four existing deployment/runtime probes against
the installed executable, uninstall and preservation of disposable app-data,
external save and unowned installation-folder sentinels.

This is packaging/lifecycle evidence on the development host. It does not imply
clean-Windows, interactive wizard, SmartScreen reputation or missing-Runtime
bootstrapper installation certification. Runtime detection follows Microsoft's
[distribution guidance](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution).
