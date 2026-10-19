# Phase 1 report — first native playable MVP

Implemented: unpackaged self-contained WinUI 3 x64 app; XAML Open/Home UI, status/loading/errors, native Microsoft.Windows.Storage.Pickers picker; Toolkit ObservableObject MVVM and Microsoft DI/logging; native icon/visible Phase 1 TEST identity; dedicated browser data; persistent UUID-based story origins; DenyCors approved-folder mapping; local resources; navigation failure and missing/empty/non-HTML handling; popup/permission/download denial; disabled host objects/messages; generation-aware initialization, event unsubscription, close/reopen/disposal and browser failure feedback.

Changed files: native solution, pinned global.json, App/Core/Persistence projects, focused Core/persistence tests, authored relative-assets fixture, native smoke/bootstrap/portable packaging tools and migration documentation. No Flutter/Electron/WPF implementation changes.

Versions: repository-local .NET SDK 10.0.402 / self-contained runtime 10.0.13 (latest stable per Microsoft's 2026-10-13 release metadata); Windows App SDK 2.5.1, resolved WinUI 2.3.9; direct WebView2 1.0.4258.31 compatible with dependency resolution; SDK BuildTools 10.0.26100.7705; minimum OS 10.0.22621.0, target 10.0.26100.0. Packages are locked with content hashes. VS2022 installed build tools suffice for this dotnet build; no VS2026/system SDK update was performed. SDK umbrella transitively deploys Microsoft AI/ML components; the app does not call or configure AI services, cloud dependencies or telemetry.

Tests executed: restore; x64 Debug and Release solution builds; dotnet tests; actual WinUI/WebView2 integration over six stories (four official engines, relative assets, user Accidental Mind 3.4). Initial runtime check found that Harlowe renders its first passage after NavigationCompleted; the runner now waits for engine output instead of assuming browser navigation means engine readiness. Both native builds completed with zero warnings/errors and all 8 unit tests passed.

Tests passed: actual native story DOM loaded for all four formats and Accidental Mind at its Title Screen; story-specific HTTPS origins; distinct localStorage; state retained after browser recreation; relative CSS/JS/SVG; DOM passage button, form/focus/scroll fixture; missing-file rejection. Latest finalized native smoke/restart/package checks are recorded in EXECUTION.md.

Portable deployment regression: the first publish omitted the application's generated PRI/XBF resources and failed its packaged startup check. The project now explicitly includes those generated resources in publish output, with correctly batched relative paths. The corrected publish passed all six native story checks in `artifacts/native-smoke-02905d2a744f44d69e11892b14252f04/report.json`. The final test artifact uses build ID `20261016-r3`; earlier artifacts/probes are failed-build evidence and must not be used for testing.

Manual Windows validation: automated native execution on this Windows 11 host; no manual visual, keyboard/mouse hardware, audio/video, screen-reader or remote-client certification. DOM-simulated interaction is not physical-input evidence. A real SugarCube 1 fixture remains missing. Browser-storage transfer from Flutter remains pending.

Performance observations: no comparative benchmark or efficiency claim. Self-contained WinAppSDK bundle is larger than the Flutter reference; no pruning was applied to SDK dependencies.

Known limitations: external top-level navigation, popups and downloads are explicitly denied in this MVP; there is no host message bridge yet. Save/load/library/console/settings are deliberately assigned to later phases. User gameplay and hardware/media checks remain open acceptance items; the phase is an implemented playable test MVP, not full migration certification.

Feature parity changes: F01–F03 implemented with native automated playback/resource evidence; portions of F29/F30 foundation established. Remaining features stay missing. Phase 0 baseline and rollback path remain intact.

Recommended next phase: Phase 2 SugarCube save/load and data-integrity MVP, continuing under the user's standing authorization. Do not perform the later Fluent redesign until save/load has real-game native tests.
