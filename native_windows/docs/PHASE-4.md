# Phase 4 report — player controls and native window management

Implemented: native CommandBar with dynamic overflow, Library/Open/Undo/Save/Load/Console entry/Fullscreen and More/Reload; native draggable title bar with system caption buttons; Mica and system theme resources; F11 fullscreen and Escape exit; AppWindow presenter transitions preserving restored/maximized state; persistent placement with nearest-display work-area clamping and XamlRoot DPI-change handling; normal bounds tracking, story focus restoration, and orderly close that cancels story operations, waits for save writes and persists placement before exit.

Changed files: native App XAML/windowing and lifecycle integration, Core placement rules/tests, SaveService idle barrier, phase identity/docs. No additional package dependency. Story undo follows the Flutter engine-first/back-history behavior. Console execution remains Phase 5; this phase adds its entry point.

Tests: Release build passed with zero warnings/errors; 18 Core/persistence + 13 Player tests passed before final packaging checks. New placement cases cover disconnected/offscreen coordinates, negative monitor coordinates, oversized/small bounds and maximized state. Actual native six-story playback/library test passed with three AppWindow fullscreen cycles, exact size restoration and SugarCube history undo in `artifacts/native-smoke-0f6a299d5e3746fc8a950ce3401aa814/report.json`. Final save/portable checks are recorded in EXECUTION.md.

Final save regression: all four Accidental Mind save stages passed in `artifacts/native-save-smoke-f5c7111ab4164026b21fb3052c7716fa/`. Programmatic integration shutdown uses the same placement/save-idle drain as the system closing handler.

Manual Windows validation: programmatic native presenter transitions and engine history were exercised on this Windows host. Physical F11/Escape, Snap/drag/resize, mixed DPI/monitors, disconnection, virtual displays and screen-reader behavior remain unverified. System theme/backdrop construction succeeds; no visual/accessibility certification or performance advantage is claimed.

Limitations: actual developer console functionality follows in Phase 5. Monitor/DPI resilience needs the Phase 8 manual matrix. Application-close persistence errors are logged locally; existing valid saves remain protected by atomic replacement. Browser storage migration remains unresolved, and Flutter/WPF/Electron source remains unchanged.

Parity: F12–F14 implemented with native undo/fullscreen evidence; window/theme/focus foundations contribute to F29/F30. Next: Phase 5 console, history/completion/saved commands, two layouts and explicit DevTools.
