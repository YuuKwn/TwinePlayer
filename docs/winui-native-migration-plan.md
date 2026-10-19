# TwinePlayer Native: WinUI 3 Migration Implementation Plan

**Project:** [YuuKwn/TwinePlayer](https://github.com/YuuKwn/TwinePlayer)  
**Target:** Windows 11 native desktop application  
**Reference implementation:** Flutter 3.47.0 / Dart 3.13.0  
**Plan date:** October 16, 2026  
**Implementation agent:** OpenAI Codex  
**Strategy:** Incremental native rewrite, feature parity, then improvements  
**Status:** Planning specification, not implementation authorization

---

# 1. Goals and Non-Negotiable Requirements

Create a high-quality Windows-native TwinePlayer using WinUI 3, the latest stable Windows App SDK, C#, and Microsoft Edge WebView2.

The application must eventually replace the functionality of the current Flutter Windows application while improving Windows integration, maintainability, reliability, and UI consistency.

## Primary goals

1. Provide excellent compatibility with existing Twine HTML games.
2. Preserve existing game saves and user data.
3. Deliver a responsive, accessible, properly native Windows 11 interface.
4. Use first-party Microsoft Windows APIs where practical.
5. Remove unnecessary Flutter/WebView interoperability layers.
6. Maintain or improve resource efficiency and application responsiveness.
7. Preserve every feature of the current Flutter application before considering migration complete.
8. Introduce new native-only features only after the essential player is reliable.

## Mandatory rules for Codex

- Do not delete, overwrite, or refactor the existing `flutter_app/` implementation.
- Do not modify the legacy Electron application unless explicitly authorized.
- Create the native implementation in a separate `native_windows/` directory.
- Treat the current Flutter application as the behavioral specification.
- Preserve existing `.save` files and sidecar directories.
- Never silently migrate, delete, or rewrite original user data.
- Use production-stable SDKs and APIs. Do not adopt experimental controls as production dependencies.
- Do not implement the complete roadmap in one coding session or PR.
- Deliver each phase independently with tests, documentation, and a functioning application.
- Never report hardware, WebView rendering, accessibility, or real-game compatibility as verified without corresponding test evidence.
- Prefer official Windows APIs over third-party libraries when the native solution is suitable.
- Do not add cloud dependencies, advertising, telemetry, or AI services without explicit authorization.

**Core architectural principle:** TwinePlayer is a game player first and a Windows application second. Game compatibility and save integrity take precedence over visual polish.

---

# 2. Final Technology Stack

## Required stack

| Component | Selection | Reason |
|---|---|---|
| UI framework | WinUI 3 | First-party modern native Windows UI |
| Windows App SDK | **2.5.1 stable** | Latest verified stable release |
| Language | C# | Productive, maintainable Windows development |
| Runtime | **.NET 10 LTS** | Stable, supported until November 2028 |
| UI declaration | XAML | Native WinUI presentation |
| Architecture | MVVM | Separation of application logic and UI |
| MVVM library | CommunityToolkit.Mvvm | Established, lightweight implementation |
| Browser engine | Microsoft Edge WebView2 | Official Chromium-based embedded web runtime |
| WebView2 SDK | **1.0.4258.31 stable** | Latest verified stable package, subject to WinAppSDK compatibility |
| Data storage | Microsoft.Data.Sqlite | Structured library and application persistence |
| Serialization | System.Text.Json | Native .NET JSON support |
| Dependency injection | Microsoft.Extensions.DependencyInjection | Lightweight service composition |
| Logging | Microsoft.Extensions.Logging | Structured application diagnostics |
| File operations | System.IO + Windows APIs | Native filesystem and atomic replacement operations |
| Native file picker | Microsoft.Windows.Storage.Pickers | Modern Windows App SDK picker APIs |
| Windows management | AppWindow + Win32 interop | Native fullscreen, placement, and lifecycle |
| Developer tooling | Visual Studio 2026 | Latest official WinUI development environment |
| Windows SDK | 10.0.26100 servicing family | Stable Windows 11 API baseline |
| Initial architecture | x64 | Match current Windows distribution |
| Initial distribution | Unpackaged, self-contained folder | Preserve the portable-first workflow |
| Later distribution | MSIX | Native installation, identity, and Windows integration |

### Version policy

Pin `Microsoft.WindowsAppSDK` to `2.5.1` for the first implementation.

Use `net10.0-windows10.0.26100.0` as the initial target framework, with Windows 11 build 22621 or later as the initial minimum OS baseline. Validate the final project template's exact target/minimum-version properties before committing them.

Use the latest stable .NET 10 patch and supported Visual Studio 2026 servicing update available during implementation.

Pin `Microsoft.Web.WebView2` to `1.0.4258.31` only after validating that the direct reference is compatible with Windows App SDK 2.5.1 and does not conflict with its WebView2 dependencies.

The WebView2 **SDK version and Evergreen Runtime version are separate**. Do not assume pinning the SDK pins the user's browser runtime.

Use the 26100-series Windows SDK initially rather than adopting newer SDK APIs without a demonstrated need. Evaluate the 28000-series SDK separately if a desirable stable feature requires it.

Do not use Windows App SDK `2.5.4-experimental`, .NET 11 prereleases, experimental WinUI Charts/TableView, or other experimental APIs in production.

### Native Windows design choices

Prefer:

- `NavigationView` for main application navigation.
- `AppWindow` and `AppWindowTitleBar` for native window management.
- Mica or Mica Alt for suitable application backgrounds.
- Acrylic for transient surfaces where appropriate.
- `ContentDialog`, `TeachingTip`, `InfoBar`, `Flyout`, and native context menus.
- Native keyboard accelerators, focus navigation, accessibility semantics, and system theme resources.
- System-provided animations with reduced-motion support.

Avoid recreating the Flutter widget hierarchy one-to-one in XAML.

The goal is behavioral parity with a better native presentation, not a visual screenshot clone.

### Distribution decision

Begin with an unpackaged WinUI 3 application.

Use:

- `WindowsPackageType=None`
- `WindowsAppSDKSelfContained=true` for portable release output
- Self-contained .NET publication for distributable builds

Validate actual output, startup, and runtime dependencies on a clean Windows machine.

Prefer a **portable folder and ZIP**, not a single-file executable, for the first releases. Single-file extraction and runtime behavior introduce unnecessary early complexity.

MSIX, installer integration, signing, auto-update, and public publication remain separate release decisions.

---

# 3. Proposed Repository Structure

```text
TwinePlayer/
├── flutter_app/                 # Existing Flutter app, untouched
├── native_windows/
│   ├── TwinePlayer.Native.slnx
│   ├── AGENTS.md
│   ├── src/
│   │   ├── TwinePlayer.App/
│   │   │   ├── App.xaml
│   │   │   ├── MainWindow.xaml
│   │   │   ├── Views/
│   │   │   ├── ViewModels/
│   │   │   ├── Controls/
│   │   │   ├── Resources/
│   │   │   └── Assets/
│   │   ├── TwinePlayer.Core/
│   │   │   ├── Models/
│   │   │   ├── Services/
│   │   │   ├── Interfaces/
│   │   │   └── Validation/
│   │   ├── TwinePlayer.Player/
│   │   │   ├── WebView/
│   │   │   ├── Bridge/
│   │   │   ├── Saves/
│   │   │   ├── Scripts/
│   │   │   └── Security/
│   │   └── TwinePlayer.Persistence/
│   │       ├── Database/
│   │       ├── Migration/
│   │       └── Stores/
│   ├── tests/
│   │   ├── TwinePlayer.Core.Tests/
│   │   ├── TwinePlayer.Player.Tests/
│   │   ├── TwinePlayer.Persistence.Tests/
│   │   └── TwinePlayer.IntegrationTests/
│   ├── fixtures/
│   ├── tools/
│   └── docs/
│       ├── FEATURE_PARITY.md
│       ├── MIGRATION.md
│       ├── COMPATIBILITY.md
│       └── BENCHMARKS.md
└── docs/
    └── winui-native-migration-plan.md
```

The folders represent architectural ownership, not a requirement to create empty abstractions immediately. Start with only the projects and services justified by Phase 1.

## Responsibilities

**TwinePlayer.App:** XAML views, window management, themes, dialogs, application commands, accessibility.

**TwinePlayer.Core:** Story identity, domain models, application service contracts, metadata and validation.

**TwinePlayer.Player:** WebView2 lifecycle, story runtime, JavaScript bridge, save capture/restore, browser security.

**TwinePlayer.Persistence:** SQLite, compatibility imports, preference storage, migration safety.

Dependency direction must avoid circular references.

The Player should not directly control XAML dialogs. It should return typed results or invoke interfaces implemented by the application layer.

---

# 4. Verified Existing Feature Inventory

This inventory is based on the current Flutter implementation and associated project documentation.

The listed capabilities are **mandatory migration parity**, unless explicitly marked otherwise.

| ID | Existing capability | Priority | Planned phase |
|---|---|---|---|
| F01 | Import local `.html` and `.htm` stories | Critical | 1 |
| F02 | WebView2 Twine HTML playback | Critical | 1 |
| F03 | Local relative assets and virtual host mapping | Critical | 1 |
| F04 | SugarCube 1/2 save capture and restore | Critical | 2 |
| F05 | Native SugarCube save/load dialog bridging | Critical | 2 |
| F06 | Sidecar `.save` files, overwrite, deletion | Critical | 2 |
| F07 | Persistent game library and recent history | High | 3 |
| F08 | Twine/SugarCube metadata extraction | High | 3 |
| F09 | Library search and sorting | High | 3 |
| F10 | Missing-file detection and relinking | High | 3 |
| F11 | Library context actions and removal undo | High | 3 |
| F12 | Undo/back navigation inside stories | High | 4 |
| F13 | Fullscreen, F11/Escape, window restoration | High | 4 |
| F14 | Compact player toolbar | High | 4 |
| F15 | Developer console and command execution | High | 5 |
| F16 | Console history, autocomplete, saved commands | High | 5 |
| F17 | Console overlay and side-by-side modes | High | 5 |
| F18 | WebView developer tools | High | 5 |
| F19 | Clickable image preview and image context actions | Medium | 6 |
| F20 | Image preview zoom, pan, reset, double-tap zoom | Medium | 6 |
| F21 | Story zoom and per-game preferences | High | 6 |
| F22 | Story Assistance v2 for four Twine formats | High | 6 |
| F23 | Enhanced choices and readability controls | High | 6 |
| F24 | Compact, Comfortable, and Auto interaction profiles | High | 7 |
| F25 | Customizable Comfortable command bar | High | 7 |
| F26 | Optional Page Up/Page Down controls | Medium | 7 |
| F27 | Opt-in privacy-safe input diagnostics | High | 7 |
| F28 | Bundled offline Input Lab | Medium | 7 |
| F29 | Accessibility and deterministic focus traversal | High | 8, with foundations earlier |
| F30 | DPI/multi-monitor resilience and lifecycle recovery | High | 8 |
| F31 | Build identity, portable ZIP, SHA-256 manifest | High | 9 |

## Important compatibility distinctions

- Story Assistance v2 supports **SugarCube, Harlowe, Chapbook, and Snowman**, subject to engine verification.
- The current native save implementation is primarily **SugarCube 1/2-specific**. Do not claim universal save support for the four story formats.
- The current Flutter player uses WebView2 virtual host mapping and injects a custom JavaScript bridge.
- Console commands are stored by game identity, using IFID where available.
- The application supports actual touch-oriented interaction profiles, not merely enlarged UI widgets.
- Hardware certification is incomplete in the current repository. The native version must not inherit unverified certification claims.

## Excluded from mandatory parity

The old Electron **AI Illustrator** subsystem, including Ollama/OpenAI-compatible text endpoints, ComfyUI image generation, galleries, and Art Dock, was intentionally excluded from Flutter.

It belongs in a separately authorized optional roadmap.

The previous Flutter roadmap also identifies pen hardware support and stable native multiwindow behavior as unimplemented. These are enhancement opportunities, not currently shipped Flutter features.

---

# 5. Phase 0: Baseline, Audit, and Native Migration Contracts

**Priority:** P0  
**Goal:** Establish an authoritative migration specification before implementing the native application.

## Tasks

1. Audit the current Flutter application, especially:
   - `flutter_app/lib/src/twine_player_app.dart`
   - `flutter_app/lib/src/services/webview_scripts.dart`
   - `flutter_app/lib/src/services/save_service.dart`
   - `flutter_app/lib/src/services/history_store.dart`
   - `flutter_app/lib/src/services/story_assistance_store.dart`
   - `flutter_app/lib/src/services/command_bar_preferences_store.dart`
   - `flutter_app/lib/src/services/interaction_profile_store.dart`
   - `flutter_app/lib/src/services/input_diagnostics.dart`
   - Windows runner and vendored WebView implementation.
2. Confirm actual supported game-engine behaviors through code and fixtures.
3. Inventory all existing data formats, save formats, preferences, and application paths.
4. Record exact SDK versions, WebView2 runtime, and reference build identity.
5. Create a feature-parity matrix identifying implemented, partially implemented, and missing features.
6. Identify existing bugs separately from intentional behavior.
7. Capture startup, idle memory, WebView memory, and basic gameplay measurements from Flutter where a working Windows machine is available.
8. Preserve or adapt the existing DOM bridge tests and game fixtures.
9. Document the native data-migration strategy.
10. Create `native_windows/AGENTS.md` containing the mandatory implementation rules from this plan.

## Data compatibility requirements

Locate and document these current Flutter files:

```text
TwinePlayerFlutter/
├── library-history.json
├── console-commands.json
├── preferences.json
├── command-bar-preferences.json
└── story-assistance.json
```

Their actual parent directory must be determined from Flutter's application support path on the target Windows machine.

Also preserve per-story sidecars:

```text
MyGame.html
MyGame_saves/
    existing-save.save
```

Do not presume WebView browser storage lives alongside these JSON files. Determine its actual profile location and origin behavior independently.

## Acceptance criteria

- Every current Flutter feature has a documented migration destination.
- Existing data formats are understood well enough to write migration tests.
- The Flutter reference continues to build and work.
- Test fixtures are available for the native implementation.
- Baseline measurements are recorded or explicitly marked unavailable.
- No production application behavior has changed.

**Deliverable:** Migration inventory, compatibility contract, baseline report, and native implementation instructions.

---

# 6. Phase 1: First Native MVP, Launch and Play a Twine Story

**Priority:** P0  
**Milestone:** First playable WinUI 3 build

The first native implementation must remain deliberately small.

A user should be able to open TwinePlayer, select an HTML game, and play it.

## Tasks

### 1. Native application scaffold

- Create the WinUI 3 solution.
- Configure .NET 10 and Windows App SDK 2.5.1.
- Configure x64 debug and release builds.
- Add application logging and global exception handling.
- Establish a basic MVVM and dependency-injection structure.
- Set up the native app icon, identity, and temporary application data location.
- Confirm a clean Windows build.

### 2. Minimal UI

Create one window with:

- Open Game button.
- Native file picker.
- Embedded WebView2.
- Back to Home button.
- Basic loading and error feedback.

Do not implement the complete library or Fluent redesign yet.

### 3. Twine runtime

Implement a `TwinePlayerService` or equivalent responsible for:

- Initializing WebView2.
- Selecting and loading `.html` and `.htm` files.
- Resolving relative CSS, JavaScript, images, and other local resources.
- Detecting navigation failures.
- Handling a missing or unreadable game file.
- Disposing WebView2 cleanly.
- Reopening stories without stale engine state.
- Allowing normal story interaction, scrolling, keyboard input, audio, and video.

### 4. Browser origin architecture

Use WebView2 virtual host name mapping rather than a general `file://`-based design.

Create a **stable, isolated virtual origin per story**, backed by a persistent story ID.

Requirements:

- A story must retain its origin after restarting TwinePlayer.
- Relinking a story must not unnecessarily invalidate its browser identity.
- Two unrelated stories must not automatically share local storage.
- Each story may access only its approved resource directory.
- Use the minimum necessary `CoreWebView2HostResourceAccessKind`.
- Relative assets must work.
- External navigation, popups, permissions, and downloads must follow explicit policies.

The current Flutter app maps stories through `twineplayer.local`, so changing the origin scheme introduces a migration concern for existing WebView browser storage.

Document that concern and provide a tested compatibility or migration path before claiming complete data parity.

For the MVP, use WebView2 Evergreen and a dedicated application user-data folder.

### 5. Native player security

Treat imported game HTML as untrusted content.

- Never expose arbitrary filesystem APIs directly to the story.
- Validate browser-to-host messages and their sources.
- Limit message sizes and accepted operations.
- Do not expose unrestricted native shell command execution.
- Deny unexpected popups by default, matching current behavior.
- Avoid automatically granting browser permissions.
- Preserve legitimate Twine JavaScript execution.

## MVP acceptance tests

- Import and play a SugarCube story.
- Import and play Harlowe, Chapbook, and Snowman fixtures.
- Navigate between passages.
- Verify local images, CSS, audio, and scripts.
- Scroll normally.
- Test mouse, keyboard, and form input.
- Close and reopen the same story.
- Open a different story and confirm state isolation.
- Verify clear errors for missing or invalid files.

## Exit criteria

**A real Twine HTML game plays successfully inside a native WinUI 3 application.**

No save system, library interface, or advanced settings are required yet.

---

# 7. Phase 2: Save/Load MVP and Data Integrity

**Priority:** P0  
**Milestone:** First actually usable native TwinePlayer

This is the most important phase after playback.

## Tasks

### 1. Port the existing save bridge

Study the current JavaScript bridge rather than independently inventing a save format.

Preserve:

- SugarCube 1 and SugarCube 2 detection.
- Supported `Save.base64` flows.
- Legacy serialization paths.
- Native SugarCube disk-save interception.
- Native SugarCube saves-dialog load behavior.
- Existing fallback and error handling.
- Existing `.save` payload compatibility.

The bridge must be injected at the correct document lifecycle stage.

### 2. Implement native save services

Create a `SaveService` with:

- List saves.
- Capture game state.
- Create save.
- Load save.
- Overwrite save.
- Delete save.
- Read save metadata.
- Detect and report invalid saves.
- Clean stale temporary files.

Use the existing sidecar directory naming convention:

```text
<GameName>_saves/
```

Preserve the `.save` extension.

Preserve the current 50 MB save size limit unless testing demonstrates a justified change.

### 3. Improve write reliability

Do not reproduce the current delete-then-rename overwrite sequence without examining its failure modes.

Implement a safer same-directory temporary-write and replacement strategy with proper error handling and recovery.

Requirements:

- Never truncate an existing save before a replacement is ready.
- Do not lose the previous valid save if the write fails.
- Prevent directory traversal and invalid Windows filenames.
- Reject empty or oversized save payloads.
- Handle insufficient permissions and disk-full conditions.
- Prevent overlapping save operations from corrupting files.
- Ensure all native-to-WebView operations handle navigation/disposal races.

### 4. Minimal native save interface

Create native WinUI dialogs for:

- New Save.
- Load Save.
- Overwrite confirmation.
- Delete confirmation.

Show filenames, modification dates, and file sizes.

Keep failed operations visible rather than closing the dialog silently.

### 5. Preserve game-engine semantics

Do not replace SugarCube's own save logic with simplistic snapshots of the document.

Test the existing native SugarCube dialog integration.

If an engine does not expose a supported save mechanism, explain that limitation instead of creating a misleading save file.

Do not implement speculative Harlowe/Chapbook/Snowman state serialization as a shortcut.

## Acceptance tests

- Capture a real SugarCube save.
- Close the app.
- Relaunch and restore the exact saved game state.
- Load an existing Flutter-created `.save` file.
- Overwrite a save.
- Delete a save.
- Cancel an overwrite or deletion.
- Test malformed, empty, oversized, and missing save files.
- Validate that failed writes preserve previous saves.
- Test asynchronous SugarCube load completion and visible error reporting.
- Test save operations after story reload and WebView recreation.

## Exit criteria

**A user can launch a Twine game, play it, save progress, exit, reopen the application, and restore progress reliably.**

This completes the **Minimum Usable Product (MUP)**.

Do not proceed with a large UI redesign until this milestone passes real-game testing.

---

# 8. Phase 3: Library, Metadata, and Existing User Data Migration

**Priority:** P1  
**Milestone:** Core Flutter library parity

## Tasks

### 1. Persistent library

Implement:

- Game registration and persistent listing.
- Last-played history.
- Duplicate prevention.
- Native library grid or list.
- Missing-file indicators.
- Open existing story.
- Remove game from library.
- Undo removal.
- Library counts and empty states.

### 2. Metadata extraction

Port the existing logic for:

- `<tw-storydata name>`.
- SugarCube metadata patterns.
- HTML `<title>`.
- Filename fallback.
- HTML entity decoding.
- Large-file metadata extraction without loading entire files unnecessarily.

Preserve metadata behavior for existing games.

### 3. Search and sorting

Implement:

- Search by title.
- Search by file path.
- Sort by recently played.
- Sort by title.
- Sort by file path.

### 4. File management

Implement native context actions:

- Play.
- Relink.
- Copy path.
- Reveal in Explorer.
- Remove from library.

Relinking must preserve associated native identity and settings when the user identifies the replacement as the same story.

### 5. SQLite storage

Use SQLite as the new authoritative library store.

Initial schema:

```text
Games
  Id
  FilePath
  Title
  IFID
  MetadataSource
  LastPlayedUtc
  DateAddedUtc
  Missing

AppPreferences
  Key
  Value
  SchemaVersion

StoryPreferences
  GameId
  PreferencesJson
  SchemaVersion
```

Extend the schema only when later phases require it.

Use schema migrations rather than replacing the database.

Avoid storing save payloads directly in SQLite. Existing sidecar saves remain independent files.

### 6. Flutter data migration

Implement an opt-in, repeatable importer.

Import relevant JSON data into the native storage system.

Requirements:

- Read-only access to original Flutter files.
- Backup/snapshot before conversion.
- Explicit migration preview.
- Validation of malformed entries.
- Idempotent migration.
- Preservation of original game paths and timestamps.
- Report of imported, skipped, and invalid entries.
- No destruction of the existing Flutter database/preferences.
- Separate handling for browser-origin storage that cannot be safely imported automatically.

The importer should also support a fresh installation with no previous Flutter data.

## Exit criteria

All current Flutter library workflows operate correctly.

Existing games can be imported without re-adding each story manually, and previously created sidecar saves remain accessible.

---

# 9. Phase 4: Native Player Interface and Window Management

**Priority:** P1  
**Milestone:** Daily-use player experience

## Tasks

### Native player controls

Recreate:

- Back to Library.
- Story undo/back.
- Save.
- Load.
- Developer Console entry point.
- More menu.
- Fullscreen toggle.
- Current story title.
- Loading/error indicators.

### Window management

Implement:

- F11 fullscreen toggle.
- Escape to exit fullscreen.
- Correct fullscreen restoration.
- Restore window bounds.
- Work-area clamping.
- Proper monitor selection.
- DPI-change handling.
- Safe close and reopen.
- Focus restoration after dialogs.
- WebView lifecycle management during navigation.

Use AppWindow and native interop rather than reproducing Flutter's fullscreen method channel.

### Fluent UI foundation

Introduce:

- Native title bar integration.
- System light/dark themes.
- Mica/Mica Alt where suitable.
- Native command controls.
- Fluent typography and spacing.
- Responsive resizing.
- Consistent dialog and context-menu styling.

Avoid excessive Acrylic effects or animations over the game viewport.

The story should remain visually prominent.

## Exit criteria

The native player has all essential Flutter player controls, polished Windows behavior, and reliable fullscreen transitions.

---

# 10. Phase 5: Developer Console and Power-User Features

**Priority:** P1  
**Milestone:** Developer-tool parity

## Tasks

Port the existing console functionality:

- Execute JavaScript within the current story.
- Show results and errors.
- Keep command history.
- Run commands again.
- Save commands.
- Delete saved commands.
- Per-game saved-command storage.
- Autocomplete.
- Keyboard navigation through suggestions.
- Scrollable autocomplete and saved-command strips.
- Overlay presentation.
- Side-by-side presentation.
- Open WebView2 DevTools.

Preserve the existing distinction between the story's JavaScript context and the native application.

### Console implementation

Use an isolated C# console service for command history and execution coordination.

Store saved commands by a stable game identity.

Preserve existing IFID-based associations where available.

Do not recreate the Flutter fallback key using nonpersistent process-dependent hashing.

Migrate existing command storage without discarding unrecognized keys.

### Security

Developer Console execution must be clearly user-initiated.

Display a scope warning explaining that commands execute in the story context.

Never expose native filesystem or application privileges simply because the developer console is open.

## Exit criteria

All current console workflows work with the native WebView2 implementation, including autocomplete, saved commands, and both layouts.

---

# 11. Phase 6: Image Preview and Story Assistance

**Priority:** P1  
**Milestone:** Complete story presentation parity

## Image features

Port:

- Clicking suitable story images to open previews.
- Image-specific context menus.
- Copy image source.
- Preview zoom in/out.
- Reset zoom.
- Pan and inspect enlarged images.
- Configurable double-tap zoom.
- Error handling for invalid image sources.

Respect images that are already interactive story controls.

Do not hijack clicks on game-owned links or buttons.

Support local resources, WebView2 virtual-host URLs, and appropriate remote image URLs without granting unrestricted filesystem access.

## Story Assistance v2

Port the current opt-in feature set:

- Story zoom.
- Enhanced choices.
- Readability assistance.
- Text scale.
- Line height.
- Paragraph spacing.
- Optional readable line length.
- Maximum line length.
- Target spacing.
- Reset to defaults.
- Per-game persistence.

Support verified behavior for:

- SugarCube.
- Harlowe.
- Chapbook.
- Snowman.

### Critical DOM requirements

Story Assistance must:

- Remain off by default.
- Detect the engine conservatively.
- Avoid modifying unknown engine surfaces.
- Preserve game-owned DOM nodes and attributes.
- Avoid replacing story HTML.
- Respect SVG, canvas, draggable areas, and contenteditable regions.
- Handle dynamic passage insertion and removal.
- Avoid duplicate observers and style elements.
- Restore the original DOM styling when disabled.
- Restore behavior after navigation and reload.

Reuse the existing JavaScript behavior and tests where compatible, but remove Flutter-specific message assumptions.

Do not implement automatic font, color, or animation changes without independent approval and test coverage.

## Exit criteria

Story Assistance and image handling reach behavioral parity with Flutter without breaking normal game content.

---

# 12. Phase 7: Touch, Adaptive Controls, Settings, and Input Lab

**Priority:** P1  
**Milestone:** Full interaction parity

TwinePlayer's touch-oriented design is an existing feature, not an optional accessibility enhancement.

## Interaction profiles

Port:

- Auto.
- Compact.
- Comfortable.

Auto mode should react to reliable input activation rather than merely pointer movement.

Avoid rapidly switching layouts during mixed mouse/touch use.

### Comfortable command bar

Implement:

- Collapsible command bar.
- Start/center/end alignment.
- Small/Standard/Large buttons.
- Left/Balanced/Right reach modes.
- Movable command ordering.
- Persistent preferences.
- Reset behavior.
- Optional Page Up and Page Down.
- Pinned Console immediately before More.
- More remaining rightmost.
- Collapse/expand control remaining in its fixed position.

Do not intercept game-owned edge gestures or override story input unnecessarily.

### Input diagnostics

Recreate the privacy-safe diagnostic system:

- Disabled by default.
- Explicit enable/disable action.
- Input-event categories and device kinds.
- Mouse/touch distinction.
- Pointer cancellation and active contact counts.
- Chrome versus WebView origins.
- Bounded in-memory history.
- Sanitized session-only scenario labels.
- Copyable diagnostic reports.
- Clear diagnostics.

Reports must exclude story content, filenames, filesystem paths, raw key values, coordinates, and unnecessary timestamps.

### Offline Input Lab

Port the bundled Input Lab fixture.

Preserve:

- Explicit launch confirmation.
- No library-history entry.
- No network requirement.
- Diagnostics disabled until enabled by the user.
- Mouse, touch, multitouch, scrolling, forms, images, and dynamic-choice test scenarios.
- Focus and fullscreen scenarios.

### External interaction validation

Test against the current project's intended client matrix:

- VoidLink native touch.
- VoidLink simulated mouse.
- Quest Virtual Desktop controller ray.
- Quest hand tracking.

Do not label any client certified until it has actually been tested.

## Exit criteria

Compact/Comfortable/Auto behavior, command-bar customization, diagnostics, and Input Lab reach functional parity.

---

# 13. Phase 8: Reliability, Accessibility, Security, and Performance

**Priority:** P0 for release readiness  
**Milestone:** Native quality certification

This phase consolidates cross-cutting work started earlier. It is not permission to postpone basic security or accessibility until Phase 8.

## Accessibility

Verify:

- UI Automation names and roles.
- Screen-reader navigation.
- Keyboard-only operation.
- Tab traversal.
- Focus restoration.
- Dialog focus trapping and escape behavior.
- High-contrast themes.
- Reduced-motion settings.
- Touch target sizes.
- Text scaling.
- Mixed DPI configurations.

## WebView2 lifecycle

Verify:

- Browser process crash handling.
- Browser recreation.
- Navigation cancellation.
- Resource cleanup.
- No duplicated event handlers.
- No stale JavaScript bridge handlers.
- No loss of saved data.
- Correct profile isolation.
- Clean exit and restart.

## Windows resilience

Test:

- Fullscreen repeated entry/exit.
- Monitor disconnection.
- Resolution changes.
- DPI changes.
- Mixed-refresh displays.
- Virtual display adapters.
- Window bounds restoration.
- Closing the player during save/load.
- Reopening stories repeatedly.

## Performance comparison

Benchmark Flutter and WinUI on identical machines and stories.

Measure:

- Cold startup.
- Warm startup.
- Idle CPU usage.
- Idle memory.
- Total host + WebView2 process-tree memory.
- GPU utilization.
- Story interaction responsiveness.
- Heavy CSS animation.
- HTML canvas behavior.
- Video playback.
- Scrolling.
- Fullscreen transitions.
- Extended sessions and reopen cycles.

Do not claim a WinUI performance advantage without measurements.

Record WebView2 Runtime, GPU driver, Windows build, app build, and test story for each comparison.

Investigate observed regressions before replacing the Flutter reference.

## Security review

Review:

- Story folder access scope.
- Virtual-host isolation.
- Web message origin validation.
- File and save path validation.
- External navigation handling.
- Browser permission prompts.
- Unexpected download behavior.
- Malformed and oversized bridge messages.
- Developer console scope.
- Browser-data retention and deletion.

## Exit criteria

The native application passes automated tests and a documented manual Windows compatibility matrix.

Unperformed checks must remain explicitly unverified.

---

# 14. Phase 9: Distribution, Documentation, and Native 1.0 Release

**Priority:** P1  
**Milestone:** Full-parity native release candidate

## Portable release

Create a Windows x64 portable build with:

- Release executable.
- Required runtime dependencies.
- Assets and configuration.
- Reproducible build script.
- ZIP output.
- SHA-256 manifest.
- Build identity.
- Automated smoke-launch checks.

Ensure deployment works on a clean supported Windows installation.

Verify the WebView2 Evergreen Runtime prerequisite and provide clear remediation if missing.

## Data and upgrade safety

- Do not share writable application databases with Flutter.
- Do not erase the Flutter installation.
- Preserve original game files and existing saves.
- Validate migrations from different current-data states.
- Keep an explicit migration report.
- Document rollback to the existing Flutter application.
- Test the behavior of new native saves when returning to Flutter.

## Release checks

- Fresh install.
- Existing Flutter user migration.
- No-library startup.
- Missing WebView2 Runtime.
- Offline use.
- No administrator privileges for ordinary operation.
- Different filesystem permissions.
- Window/DPI restoration.
- Antivirus/SmartScreen considerations.
- Portable ZIP extraction.
- Shutdown/relaunch smoke tests.

## MSIX evaluation

Only after portable parity, evaluate MSIX packaging and package identity.

Consider:

- File associations.
- Explorer integration.
- Installation and uninstallation.
- App Installer updates.
- Microsoft Store distribution.
- Code signing.
- Windows package identity.
- Data-location changes introduced by packaging.

Do not silently change the user-data location when moving from unpackaged to packaged builds.

Installer creation, signing, publishing, automatic updating, and telemetry require separate approval.

## Exit criteria

The native application provides complete verified Flutter feature parity, can be distributed as a portable Windows build, and has a documented rollback and migration path.

This is the first candidate for replacing the Flutter app.

---

# 15. Phase 10: Native-Only Enhancements

**Priority:** P2/P3  
**Status:** Optional, after full parity

These features exploit advantages of WinUI 3 but should not delay the core migration.

## Potential enhancements

### A. Multiple native windows

- Detachable developer console.
- Independent auxiliary windows.
- Multiple story windows.
- Correct per-window WebView ownership.
- Isolated focus and fullscreen state.
- Coordinated save operations.

Unlike the previous Flutter roadmap, WinUI provides mature native window management APIs. Nevertheless, proper implementation and testing are still required.

### B. Better Windows integration

- `.html` and `.htm` Open With integration where appropriate.
- Recent stories through Windows Jump Lists.
- Native window placement persistence.
- Windows 11 Snap Layout compatibility.
- Contextual Explorer integration.
- Native taskbar and application lifecycle features.

Avoid claiming exclusive ownership of all HTML files.

### C. Expanded input support

- True stylus and inverted-stylus behavior.
- Pressure, hover, and cancellation handling where relevant.
- Improved native touch integration.
- Gamepad-specific controls if there is demonstrated demand.

Real pen hardware remains mandatory for certification.

### D. Enhanced diagnostics

- Structured crash reports saved locally.
- Optional support bundle creation.
- More advanced WebView2 lifecycle reports.
- Per-story troubleshooting information.
- Performance diagnostics.

No automatic telemetry.

### E. AI Illustrator (separate project authorization)

If requested, revisit the legacy Electron implementation:

- Ollama or OpenAI-compatible text backends.
- ComfyUI integration.
- Scene capture.
- Prompt generation.
- Gallery.
- Art Dock.
- Local illustration metadata sidecars.
- User-controlled endpoint/privacy settings.

This is **not** a requirement for native Flutter parity.

---

# 16. Testing Strategy

## Automated tests

Use .NET tests for:

- Metadata parsing.
- Story identity.
- Library operations.
- SQLite schema migration.
- Import validation.
- Save filename/path validation.
- Save-file operations.
- Preferences normalization.
- Command-bar ordering.
- Bridge message parsing.
- Diagnostics schema.

Keep applicable existing Node/DOM tests as language-independent behavior tests.

Use Playwright or another appropriate browser-based runner for HTML bridge fixtures.

Use Windows integration tests for WinUI/WebView2 functionality that cannot be reliably tested without a native application.

## Mandatory real-game fixtures

At minimum:

1. SugarCube 2 story with native disk save/load.
2. Legacy SugarCube 1 story.
3. Harlowe story.
4. Chapbook story.
5. Snowman story.
6. Story with local images and scripts.
7. Story with forms and dynamic passages.
8. Story with animation and media.
9. Story with intentionally malformed HTML or invalid save data.
10. Existing Flutter-created save files.

## Definition of done for every phase

A phase is complete only when:

- Its functionality is implemented.
- Its acceptance tests pass.
- The Windows application builds successfully.
- The intended user workflow works on a real Windows installation where hardware testing is required.
- Relevant documentation is updated.
- No previously working critical functionality regresses.
- New dependencies and design decisions are documented.
- Remaining limitations are stated clearly.

---

# 17. Codex Execution Protocol

Codex must follow these instructions throughout the migration.

## Before each phase

1. Confirm repository and current branch.
2. Check for uncommitted user changes.
3. Read `AGENTS.md` and the implementation plan.
4. Inspect the corresponding Flutter source and tests.
5. Identify exact acceptance criteria.
6. Produce a short task checklist for that phase.
7. Work on a dedicated implementation branch.

## During implementation

- Work on one phase at a time.
- Use small, reviewable commits.
- Prefer modifying existing native services to creating duplicate implementations.
- Do not introduce unrelated dependencies.
- Do not change the Flutter reference.
- Maintain backward compatibility where required.
- Add tests for bugs and new behavior.
- Avoid silently swallowing exceptions.
- Keep UI responsive by moving filesystem and database work off the UI thread.
- Use cancellation and proper disposal for asynchronous operations.
- Never fabricate successful test results.

## After implementation

Run:

```powershell
dotnet restore
dotnet build native_windows/TwinePlayer.Native.slnx -c Release
dotnet test native_windows/TwinePlayer.Native.slnx -c Release
```

Adapt commands if the final solution structure requires it.

Additionally run the specific bridge and integration tests relevant to the completed phase.

Report:

```text
Phase:
Implemented:
Changed files:
Tests executed:
Tests passed:
Tests failed:
Manual Windows validation:
Performance observations:
Known limitations:
Feature parity changes:
Recommended next phase:
```

Do not begin implementing the next phase automatically. Stop at its decision gate.

## PR strategy

Prefer one phase per PR, with smaller PRs for large or risky phases.

The save bridge, persistence migration, and complex WebView lifecycle work deserve particularly narrow reviews.

A phase may be subdivided without altering the overall roadmap.

---

# 18. Roadmap and Release Gates

| Phase | Deliverable | Release gate |
|---|---|---|
| 0 | Audited migration specification | Groundwork complete |
| 1 | Native Twine HTML playback | **Playable MVP** |
| 2 | Persistent SugarCube save/load | **Minimum usable product** |
| 3 | Complete library and data import | Library parity |
| 4 | Player controls and native windowing | Daily-use player |
| 5 | Developer console | Power-user parity |
| 6 | Images and Story Assistance | Story experience parity |
| 7 | Touch, profiles, diagnostics | Input parity |
| 8 | Accessibility, resilience, performance | Quality certification |
| 9 | Portable distribution and release | **Native 1.0 candidate** |
| 10 | Optional native-only enhancements | Future versions |

**Critical path:** Phase 0 → Phase 1 → Phase 2 → Phase 3.

After Phase 3, some UI and feature work can proceed in parallel, but all critical features must converge before the release gate.

Phase 8's quality requirements apply continuously. Do not knowingly introduce insecure browser access or inaccessible critical dialogs just because their final certification occurs later.

---

# 19. First Codex Instruction

Use the following as the initial execution instruction:

> Implement **Phase 0 only** of the TwinePlayer Native WinUI 3 Migration Implementation Plan.
>
> Work in `YuuKwn/TwinePlayer`, using the current `main` branch as the source of truth.
>
> Fully inspect the Flutter 3.47 application, particularly the WebView2 bridge, save/load implementation, persistence formats, and existing feature tests. Verify the planned native stack against the currently available stable Microsoft tooling and document any compatibility deviations.
>
> Create the migration feature-parity matrix, baseline and compatibility contracts, native implementation architecture, and `native_windows/AGENTS.md`.
>
> Prepare the new native implementation structure without overwriting or changing existing Flutter functionality. Do not prematurely implement the complete native application.
>
> Document existing save compatibility, browser-origin storage migration risks, security boundaries, and the minimum working criteria for Phases 1 and 2.
>
> Execute the available validation checks, report the actual results, and stop after Phase 0. Do not proceed to Phase 1 until explicitly instructed.

---

# 20. Reference Sources

## TwinePlayer

- [Repository](https://github.com/YuuKwn/TwinePlayer)
- [Flutter source](https://github.com/YuuKwn/TwinePlayer/tree/main/flutter_app)
- [Flutter application](https://github.com/YuuKwn/TwinePlayer/blob/main/flutter_app/lib/src/twine_player_app.dart)
- [WebView JavaScript bridge](https://github.com/YuuKwn/TwinePlayer/blob/main/flutter_app/lib/src/services/webview_scripts.dart)
- [Save service](https://github.com/YuuKwn/TwinePlayer/blob/main/flutter_app/lib/src/services/save_service.dart)
- [Story Assistance](https://github.com/YuuKwn/TwinePlayer/blob/main/flutter_app/lib/src/services/story_assistance_store.dart)
- [Touch roadmap](https://github.com/YuuKwn/TwinePlayer/blob/main/docs/touch-phases-7-10-roadmap.md)
- [Flutter certification report](https://github.com/YuuKwn/TwinePlayer/blob/main/docs/flutter-3.47-certification-report.md)

## Microsoft

- [Latest Windows App SDK downloads](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/downloads)
- [Windows App SDK 2.x release notes](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/release-notes/windows-app-sdk-2-0)
- [Create a WinUI 3 application](https://learn.microsoft.com/en-us/windows/apps/get-started/start-here)
- [WebView2 with WinUI 3](https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winui)
- [WebView2 local content handling](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/working-with-local-content)
- [Modern Windows file pickers](https://learn.microsoft.com/en-us/windows/apps/develop/files/using-file-folder-pickers)
- [Unpackaged WinUI distribution](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/unpackage-winui-app)
- [Microsoft.Web.WebView2 NuGet](https://www.nuget.org/packages/Microsoft.Web.WebView2)
- [.NET support lifecycle](https://learn.microsoft.com/en-us/dotnet/core/releases-and-support)

---

**Final success criterion:** TwinePlayer Native matches all supported Flutter functionality, preserves existing user content and saves, passes representative Twine compatibility tests, and provides a measurably reliable, accessible, native Windows 11 experience. Only then should the Flutter implementation be considered replaceable.