# TwinePlayer Native — incremental WinUI migration

**Published preview:** [Native 0.9.0 — UX Preview 5](https://github.com/YuuKwn/TwinePlayer/releases/tag/native-v0.9.0-ux5). The user approved this candidate for a squash merge and GitHub release. Download and extract the whole portable ZIP. The release retains the tested candidate's visible UX Preview 5/TEST identity and exact bytes; its build identity records source `d169dce`, with publication provenance attached to the release. See [UX-NATIVE-SAVES.md](docs/UX-NATIVE-SAVES.md) for current behavior. The migration acceptance records below are historical; publishing this approved preview is now authorized.

> **Current status — 2026-10-17:** Mandatory migration phases 0–9 are implemented and accepted on the user's Windows setup with Phase 9 TEST r4 (`20261017-r4`, binary source `12c9779`). The user reported "All good, tested here" and then explicitly waived the additional accessibility/display, VoidLink/Quest and separate clean-Windows validation: "No need foe all thoae". Those scenarios remain unverified and are no longer completion gates for this delivery. Earlier pending/blocker entries below are historical evidence, superseded by this acceptance and waiver. Optional Phase 10, signing, installers and publishing remain outside this delivery. The accepted immutable r4 package keeps its TEST label and is not rebuilt or renamed.

Phase 9 TEST provides a Windows 11 x64 WinUI 3 application with local HTML playback, isolated story origins, a SQLite library, explicit Flutter JSON/browser-data import and SugarCube 1/2 sidecar save/load. Console, image previews, opt-in Story Assistance, adaptive controls, private diagnostics and offline Input Lab are implemented. Browser-data migration and native-save rollback have controlled runtime evidence. Manual accessibility, physical clients and clean-machine release gates remain open; this is not Native 1.0 certification. Flutter, Electron and WPF remain untouched.

Build with the pinned current .NET 10 SDK and Windows SDK 26100 tools:

```powershell
cd F:\GitHub\TwinePlayer\native_windows
$sdk = .\tools\bootstrap-dotnet.ps1
& $sdk restore TwinePlayer.Native.slnx
& $sdk build TwinePlayer.Native.slnx -c Release
& $sdk test TwinePlayer.Native.slnx -c Release
.\tools\run-native-smoke.ps1
```

Bootstrap downloads Microsoft's SDK into ignored `artifacts/toolchain/` and verifies its published SHA-512; it does not change the system SDK. The installed VS2022 tools successfully compiled this WinUI application with dotnet; VS2026 is recommended by the current Microsoft quickstart but was not installed as part of this migration.

Optional native integration against a private game:

```powershell
.\tools\run-native-smoke.ps1 -RealStory 'C:\Games\MyGame.html'
```

The runner uses a disposable browser profile and writes only native test data/reports under artifacts. It launches the actual WinUI application/WebView2, checks rendered DOM, isolated origins, storage retention, local assets and missing-file handling. It does not certify physical input, screen readers, media decoding or remote streaming clients.

Use `tools/run-save-smoke.ps1 -RealStory <self-contained-SugarCube-game>` for actual native capture/restart/restore and engine disk-load testing, including .save files produced by the unchanged Flutter SaveService. The runner copies the story into its own artifact folder and never writes original sidecars. The authored genuine v1 fixture is under fixtures/sugarcube1/ with its license and provenance.

After committing a phase, package with `tools/package-test-build.ps1 -Phase 9 -BuildId <unique-label>`. It publishes an unpackaged self-contained portable folder, keeps phase identity visible, records exact native source commit and hashes, then creates a ZIP and SHA-256 manifests. Keep all extracted DLLs/assets beside the executable. WebView2 Evergreen Runtime is a separate prerequisite; installation/repair instructions are in docs/PHASE-9.md.

Native data defaults to `%LOCALAPPDATA%\TwinePlayer.Native`. `TWINEPLAYER_NATIVE_DATA_ROOT` overrides it for isolated tests. A phase-1 identity registry is needed before the phase-3 SQLite library exists; its IDs must be preserved during that upgrade. Corrupt registries are preserved and reported instead of silently changing browser origins.

See docs/PHASE-0.md, docs/PHASE-1.md, docs/FEATURE_PARITY.md and docs/MIGRATION.md for evidence, remaining work and data boundaries.


## WinUI UX follow-up — 2026-10-17

The post-migration UX refresh is documented in [UX-REFRESH.md](docs/UX-REFRESH.md). UX Preview 1 adds a native TitleBar, layered library and console, useful empty/search states, responsive controls and grouped settings. It retains the existing separate native profile and save formats. Build 20261017-ux1 is a separate marked portable test package; r4 remains available.

## Right sidebar — UX Preview 2

The latest UI puts player/app commands, library actions and status in a right sidebar instead of horizontal toolbars. See [UX-SIDEBAR.md](docs/UX-SIDEBAR.md). Compact uses icons, Comfortable uses larger labelled buttons, and the sidebar can collapse. Build 20261018-ux2 is separate from previous previews.

## UX Preview 3 — native conventions

[UX-CONVENTIONS.md](docs/UX-CONVENTIONS.md) records the further WinUI review and implementation: quieter compact controls, native access keys, grouped menus, clear primary settings actions and live Save/Load validity. The right sidebar remains in place. Build 20261018-ux3 is a separate marked preview.
