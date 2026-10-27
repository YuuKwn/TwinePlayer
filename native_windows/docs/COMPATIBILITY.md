# Runtime and acceptance contract

**TwinePlayer 1.0:** The native migration is the primary official product. Save/Load managers are modeless panels within the player viewport so their sidebar buttons can close them; overwrite/delete confirmations remain modal. Home confirms before detaching the story, defaulting to Stay in game. Actual engine save payloads, first-use dialog suppression and data locations are unchanged. New UI integration tests cover native panel writes/restores, no-write toggles, hit targets in both sidebar profiles/states and Home state preservation. See RELEASE-1.0.md and EXECUTION.md. Earlier phase evidence and unverified hardware/client scope remain historical and explicit.

2026-10-18 UX Preview 5 follow-up: native Save/Load directly invokes SugarCube disk routines with in-memory files and no visible engine Saves window. Early native-only browser interception handles first-use save pickers and browser/page Save As. Genuine SC1 1.0.35 and SC2 2.18.0/2.36.1/2.37.3 regressions cover valid, invalid and repeated operations; custom save menus/bundles remain a compatibility boundary. Details and final native evidence: UX-NATIVE-SAVES.md and EXECUTION.md.

## Architecture

App: WinUI 3 XAML, MVVM, DI, native dialogs/pickers, AppWindow, themes and accessibility. Core: metadata, identity and validation without XAML dependencies. Player: WebView2 lifecycle, bridge, origin policies and save files; no direct dialog control. Persistence: versioned SQLite and read-only-source imports. Dependencies point from App to services and services to Core; no cycles. Create projects when their phase needs them.

Use stable Windows App SDK 2.5.1 and net10.0-windows10.0.26100.0; validate TargetPlatformMinVersion 10.0.22621.0 against the actual template. x64 Debug/Release, WindowsPackageType=None, self-contained .NET and Windows App SDK portable folders. Direct WebView2 1.0.4258.31 reference is conditional on successful dependency compatibility validation. Do not adopt experimental controls or .NET 11. Toolkit MVVM, Microsoft DI/logging and Microsoft.Data.Sqlite are the selected supporting dependencies.

Verified official package pages on 2026-10-16: [Windows App SDK 2.5.1](https://www.nuget.org/packages/Microsoft.WindowsAppSDK/2.5.1), [WebView2 1.0.4258.31](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4258.31), [Microsoft SDK downloads](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/downloads), [.NET support](https://learn.microsoft.com/en-us/dotnet/core/releases-and-support). Package existence does not establish a successful restore/build. No AI services will be called; review the Windows App SDK umbrella package's bundled AI/ML dependencies during restore and document what is deployed.

Installed here: .NET SDKs 9.0.203 and 10.0.201; Windows SDK 10.0.26100.0; Visual Studio 2022 Community, with no Visual Studio 2026 installation found; WebView2 Evergreen Runtime 155.0.4283.45. Flutter cache version: 3.47.0 / Dart 3.13.0, framework 4cf24164269a5ebf0c16a028a00727d0e77bbb05. SDK/runtime versions are separate. Phase 1 must test actual build-tool compatibility and document any required tooling update.

Phase 1 validation: stable package restore succeeded without conflict; dotnet/WinUI XAML compilation succeeds using installed VS2022 Windows tools. The repository-local, hash-verified .NET SDK 10.0.402/runtime 10.0.13 fulfills the current-patch requirement without changing the root global.json or system SDK. See [Microsoft release metadata](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json). Supporting library versions: CommunityToolkit.Mvvm 8.4.0 and Microsoft.Extensions DI/logging 10.0.0, locked in source. The stable Windows App SDK umbrella deploys AI/ML dependencies transitively; no AI service or cloud call is implemented. No experimental control/API is used by the app.

## Browser security and lifecycle

- Map only the selected approved story directory to its persistent isolated origin. DenyCors is the initial resource access policy; don't map drives/parents or use file:// as the player design.
- Accept messages only from the current top-level story origin. Require a recognized type, bounded strings/arrays and valid field types; size limits account for the 50 MiB save payload and JSON byte-array expansion. Stale generation, unexpected frame/source and oversized messages must fail closed.
- No host objects, arbitrary filesystem reads, shell execution, automatic permissions or unrequested downloads. Deny popups. Keep legitimate story JavaScript and same-origin media functional.
- External HTTP(S) links require explicit user navigation policy; don't allow external documents to acquire the story bridge. Block unexpected schemes. DevTools and console are explicit user actions scoped to story JavaScript.
- Recreate/dispose WebView safely, unsubscribe events, cancel pending work, clear previous mapping and ignore stale generation results. Show navigation/process failure with a recoverable retry action. Do not erase browser storage during recreation.

## Phase 1 checklist

Scaffold; logging/global error handling; app icon and phase identity; native picker/Open/Home; loading and error UI; stable origin persistence; dedicated browser profile; local relative assets; controlled navigation/popups/permissions/downloads; cancellation/disposal.

Acceptance: restore + x64 Debug/Release build + tests; real WebView2 play and passage changes in SugarCube/Harlowe/Chapbook/Snowman; local CSS/JS/images/audio/video; scrolling/mouse/keyboard/forms; same-story close/reopen; different-story storage isolation; missing/unreadable/invalid HTML errors. A DOM test is supporting evidence, not the native exit criterion. User project: `F:\AI\_rmse-main 2\Ongoing\Text Only\Accidental Mind\AccidentalMind-Alpha-3.4\AccidentalMind - Alpha - 3.4.html`. The directory also contains 3.5 and 3.6 stories and existing exported saves; use 3.4 first. Read originals only; test writes use a disposable copy. Do not distribute these private files in test ZIPs.

## Phase 2 checklist

Port the exact bridge semantics; capture/list/create/load/overwrite/delete/metadata; stale temp cleanup; 50 MiB validation; durable atomic replacement; serialized operations; generation-aware async calls; native Save/Load dialogs with filename/date/size and visible errors; confirmation/cancel.

Acceptance: capture a real SugarCube save, close app, reopen and restore exact passage/variables; load a proven Flutter-created .save; overwrite/delete and cancellation; malformed/empty/oversized/missing saves; failed write preserves old bytes; asynchronous load success/failure; reload/recreation races; native SugarCube dialog integration. Keep unsupported engines explicitly unsupported for host save operations. No large redesign before this passes.

## Later manual release matrix

Phase 9 r3 closes a confirmed routing gap: XAML accelerators alone did not handle browser-focused F11. Own-UI-thread/window-scoped native message routing now handles existing fullscreen/zoom shortcuts. An opt-in, foreground-guarded Windows SendInput integration suite passes native Tab/Shift+Tab/modal Escape and browser-focused F11/Escape/Ctrl zoom/reset; ordinary game Escape is retained and synthetic DOM keys cannot invoke native shortcuts. See PHASE-9.md and WINDOWS-VALIDATION.md. This does not certify complete keyboard workflows, screen readers or physical clients.

Pending: keyboard-only and screen reader UIA, focus trapping/restoration, contrast/reduced motion/text scale; native crash/recreation/reopen soak; fullscreen cycles; mixed DPI/refresh/monitors and disconnect/virtual adapters; media/canvas/animation; save during close; clean Windows portable extraction, offline, missing Runtime remediation, no-admin and permission-limited use; migration/rollback and Flutter save roundtrip. VoidLink native touch/simulated mouse and Quest controller-ray/hand tracking require actual client tests. Pen and optional multiwindow remain unshipped enhancements.

Version 1.1 integrates command shortcuts and console pane resizing onto the stable 1.0 product. Native UI automation covers the prior controls and new features; see RELEASE-1.1.md and EXECUTION.md for evidence boundaries.
