# Flutter 3.47 implementation progress

**Updated:** 2026-08-26
**Current source base:** 0aac37a82fbaf17570d8e03f7d8763fbe059d12b
**Current lane:** Flutter 3.47 implementation pass complete; external-gates checkpoint
**Status:** All safely actionable document items are delivered: Gate 0, P0 certification, DXGI alignment, P1 build identity, P1 focus debug, P1/P2 semantics, and P2/N3 decisions. The N1 hardware gate and N2 stable-API gate remain external and **NOT CERTIFIED / NOT IMPLEMENTED**.

## Completed

- **Gate 0 / PR #2:** complete. The merged Flutter 3.47/Forui semantics
  compatibility fix is preserved at
  236194855836844cb9537263864fa80d0b858cc4.
- **PR #3:** squash-merged to YuuKwn `main` at
  5810af400ade1d84d5ff803f92b20d94aa45cbe6. Final CI run `32878550377`
  retains the same pre-existing Electron line-209 outside-viewport failure;
  it does not cover or invalidate this Flutter-native change.
- **PR #4:** squash-merged to YuuKwn `main` at
  94a6716ac21b35125c77388529d0387dcfc0cd9d. Final CI run `32882310406`
  retains the same verified pre-existing Electron line-209 outside-viewport
  failure; it does not cover or invalidate the P0 Flutter-native change.
- **P0 inherited-behavior certification:** evidence captured in
  [flutter-3.47-certification-report.md](flutter-3.47-certification-report.md).
  Flutter 3.47 pub get, analyzer, 67/67 Flutter tests, 7/7 vendored
  WebView tests, Windows release build, 26-file package/hash/ZIP verification,
  three smoke cycles, and all four named root Node/DOM suites passed.
- Runtime telemetry observed Impeller OpenGLESSDF in one packaged run. The
  packaged process loaded the Flutter and WebView bridge DLLs and closed with
  exit code 0. This is not GPU, WebView-content, visual, or hardware
  certification.
- No application source defect was reproduced during the inherited-behavior
  certification pass, and no application source was changed in that pass. The
  initial Node filesystem EPERM and Node 21 engine warnings are preserved as
  environment notes in the report.
- **P0 DXGI adapter alignment:** implemented in the focused native plugin lane.
  Registration now owns Flutter's `IDXGIAdapter` in `winrt::com_ptr`, passes it
  through `WebviewWindowsPlugin` and `WebviewPlatform` into `GraphicsContext`,
  and creates D3D11 with that non-null adapter and
  `D3D_DRIVER_TYPE_UNKNOWN`. Adapter absence and device/WinRT conversion
  failure remain the existing `unsupported_platform` path; no default-adapter
  hardware or WARP retry is used. The GPU and PixelBuffer implementations both
  consume this same context.
- Adapter seam evidence: the standalone MSVC/Windows SDK CTest harness passed
  1/1 executable (adapter pointer, `UNKNOWN`, BGRA/VIDEO flags, null-adapter
  short-circuit, null output, and HRESULT propagation). Vendored Dart tests
  passed 7/7, `flutter analyze` reported no issues, and full Flutter tests
  passed 67/67. Default GPU release build and separate PixelBuffer CMake release
  build both passed. Root gates passed: bridge DOM, Story Assistance DOM,
  Windows resilience, and legacy Node tests 132/132. Packaging verified 26
  files, manifest/ZIP hashes, and 3/3 smoke cycles. Runtime GPU/adapter,
  WebView-content, visual, input, accessibility, DPI, and real-game behavior
  remain NOT CERTIFIED.
- Default GPU package `1.0.0+10` hashes: EXE
  `18F4C30F7568671C54EC4BCE35C8E8AF7E1E16649CFA8D942AE0764D45972266`,
  manifest
  `8B0D5B10716FEB83A2B7BF9D2AC881B9CE2FE4475ADF03B2DEB1E3A3076863CC`,
  ZIP
  `CA073BF1349D37DFCF3D392513533C69C48A8692E2D53DDB4684608867F6FFBE`.
- **PR #5 / P1 build identity:** implemented from Flutter 3.47's
  `appBuildName`/`appBuildNumber` at `TwinePlayerDependencies.create()` with
  no `package_info_plus`. Immutable normalization trims valid ASCII
  version-like values and rejects absent, whitespace, control, path-like, and
  over-64-byte inputs without coercion. Settings and Diagnostics each expose
  one ordered, noninteractive `Build identity:` row. The shared diagnostics
  recorder preserves the exact absent-identity report schema and adds only the
  allowlisted top-level `appBuildName`/`appBuildNumber` keys when present.
  Focused tests passed 19/19, the full Flutter suite passed 72/72, and
  `flutter analyze` reported no issues. The final semantics correction uses a
  single `Text` with a deterministic semantics label and no semantics
  exclusion. Default `1.0.0+10` and override `9.8.7+42` release builds
  passed; generated defines and PE versions matched. The corrected normal
  package verified 27 files, 3/3 smoke cycles, EXE
  `BB322EA778A27A12A6343477AD6D5571392A1783A77E46DE9CCBE7DE30660A17`,
  manifest
  `46C6712128112495D0C3D7AF44D8D1E0C40B4C8C05278CBF8E9A9C570B06458A`, and
  ZIP
  `074D795D698EC4D86C83F9EAB5E181A972EF3AE29204C12861A54BE2A5D7E38F`.
  The 27-file count is intentional current-build output, not override
  contamination: compared with the PR #4 26-file inventory, the only added
  path is root `native_assets.json`, byte-identical to
  `data/flutter_assets/NativeAssetsManifest.json` (SHA-256
  `9548A31E4A048135C1D94F919328BFB62AE2C7BB3CAB96557C7941DAA97776CB`). The
  package script rebuilt with its explicit normal `1.0.0+10` flags and copied
  the release inventory/hash-for-hash before packaging.
  Root Node/DOM/resilience gates passed: 132/132 Node tests and all three
  named DOM/resilience suites. Packaged UI/report comparison and screen-reader
  order remain manual **NOT CERTIFIED**.
- **PR #6 / P1 debug-only focus visualization:** squash-merged to YuuKwn
  `main` at `4a3dd210ee7eb60f72930803b5fc0a535815583b`. Final CI run
  `32976371828` is not green only because the same pre-existing legacy Electron
  outside-viewport timeout seen on PRs #2/#3 occurs at
  `test/electron-integration.js:209`, where
  `getByRole('button', { name: /Library/ })` resolves the Back to Library
  button outside the viewport. Electron remains unchanged and out of scope.
  The compile-time
  `TWINEPLAYER_FOCUS_DEBUG` request and pure two-input gate live in
  `flutter_app/lib/src/focus_debug.dart`; startup config runs before async
  dependency creation or `runApp`; no runtime toggle, report field,
  telemetry, persistence, or WebView DOM behavior was added. The four gate
  combinations pass, the actual Flutter focus-border widget test passes 2/2,
  Compact traversal passes 1/1, the full Flutter suite passes 75/75, and
  `flutter analyze` reports no issues. Debug-with-define, release-without-
  define, and release-with-define Windows builds all pass. The release result
  is source/build proof of the `kDebugMode` guard only; runtime focus visuals,
  keyboard restoration, WebView DOM focus, and state-preservation behavior
  remain manual **NOT CERTIFIED**.
- **PR #7 / P1/P2 stronger semantics regression contracts:** squash-merged to
  YuuKwn `main` at
  `1f2f37b2f30563150c59d8bacd8e1c1deface801`. Final CI run `32981133318` is
  not green only because the same pre-existing legacy Electron outside-viewport
  timeout seen on PRs #2/#3 occurs at `test/electron-integration.js:209`, where
  `getByRole('button', { name: /Library/ })` resolves the Back to Library button
  outside the viewport. Electron remains unchanged and out of scope. The
  stronger semantics contracts were implemented as a test-only change on top
  of PR #6. The final focused files are
  `flutter_app/test/adaptive_controls_widget_test.dart` (3/3),
  `flutter_app/test/library_save_widget_test.dart` (8/8),
  `flutter_app/test/player_chrome_widget_test.dart` (14/14), and
  `flutter_app/test/console_widget_test.dart` (5/5). The full Flutter suite is
  79/79 and the pinned analyzer reports no issues. Flutter 3.47 role-aware
  assertions use `role: ui.SemanticsRole.alertDialog` on stable settings,
  overwrite, and delete dialog nodes; button flags/actions, toggled state,
  and implicit-scrolling contracts cover the remaining user-facing surfaces.
  The strict save text-field contract and both existing Comfortable/Compact
  traversal tests are preserved. `command_bar_preferences_test.dart` and all
  application source remain unchanged. Screen-reader, keyboard-only, and
  visual/accessibility behavior remain manual **NOT CERTIFIED**.

- **P2 Windows flavors / N3 certification release track:** the P2 decision gate
  closed 2026-08-26 against the merged base above as **NOT ADOPTED AT THIS
  TIME**; the dependent N3 gate is also closed as **NOT ADOPTED AT THIS TIME**
  and is **NOT SCHEDULED**. Input Lab is already bundled offline,
  opt-in, and diagnostics-disabled by default; P0/P1 build identity plus exact
  manifest/hash evidence makes the current standard artifact attributable; and
  `tool/package_windows_release.ps1` intentionally builds/replaces one exact
  hard-coded artifact. No user-facing or certification behavior difference
  between proposed standard and lab binaries is defined. Label-only binaries
  would double build/smoke/manual certification surfaces, make the lab result
  non-identical to standard, and add CMake/runner/package risk without
  operational value. No source/CMake/package changes were made. The chosen
  certification path remains one standard artifact plus build identity, exact
  hashes, and checklist/report evidence; this does not imply manual hardware
  certification.

- **PR #8 / P2 Windows flavor and N3 release decision gate:** squash-merged to
  YuuKwn `main`
  at `0aac37a82fbaf17570d8e03f7d8763fbe059d12b`. Final CI run `32982275914`
  is not green only because the same pre-existing legacy Electron
  outside-viewport timeout occurs at `test/electron-integration.js:209`, where
  `getByRole('button', { name: /Library/ })` resolves the Back to Library
  button outside the viewport. Electron remains unchanged and out of scope.

## Merged PR ledger

| PR | Item | Squash-merge commit |
| --- | --- | --- |
| #2 | Gate 0 / Save dialog semantics | `236194855836844cb9537263864fa80d0b858cc4` |
| #3 | P0 inherited-behavior certification | `5810af400ade1d84d5ff803f92b20d94aa45cbe6` |
| #4 | P0 DXGI adapter alignment | `94a6716ac21b35125c77388529d0387dcfc0cd9d` |
| #5 | P1 build identity | `228937926c2d8b9fec6405f303b4569ef5bb5619` |
| #6 | P1 debug-only focus visualization | `4a3dd210ee7eb60f72930803b5fc0a535815583b` |
| #7 | P1/P2 semantics contracts | `1f2f37b2f30563150c59d8bacd8e1c1deface801` |
| #8 | P2/N3 Windows flavor decision gate | `0aac37a82fbaf17570d8e03f7d8763fbe059d12b` |

## GitHub delivery check

PR #3 final check run 32878550377, PR #4 final check run 32882310406, PR #6
final check run 32976371828, PR #7 final check run 32981133318, and PR #8
final check run 32982275914 are **not green** because the out-of-scope legacy
Electron smoke test “selects a fixture game and supports library search and
sort” times out when `getByRole('button', { name: /Library/ })` resolves the
Back to Library button outside the viewport at
`test/electron-integration.js:209`. The exact signature matches merged Flutter
PR #2 check run 31730990711, so this is verified pre-existing and unrelated to
the Flutter-native implementation. Electron remains out of scope and unfixed;
all Flutter P0/P1 evidence remains passed.

## Next dependency

**N1 — Stylus/pen hardware spike:** **BLOCKED BEFORE THE HARDWARE SPIKE / NOT
IMPLEMENTED**. The P2 Windows flavor decision is **NOT ADOPTED AT THIS TIME**,
dependent N3 is **NOT ADOPTED AT THIS TIME / NOT SCHEDULED**, and N1 remains
blocked until the external inputs in the research gate exist. No safe code PR is
justified without real stylus/inverted-eraser/barrel/hover evidence, an
attributable Input Lab/Win32 comparison, and the required WebView2 pointer
mapping. Do not infer pen support from Flutter event APIs or automated tests.

**N2 — Stable desktop windowing gate:** **DO NOT SHIP / NOT IMPLEMENTED** on
Flutter 3.47. A disposable experimental spike must not be merged to production;
no production PR is justified until Flutter exposes a stable API and the
per-view HWND/WebView plus state, focus, fullscreen, save, and accessibility
design is reviewable.

Keep focus painting, runtime GPU, packaged UI/report, and manual accessibility
evidence separate from source/build evidence.

## Remaining items in document order

1. N1 — Complete stylus and pen support end to end: **BLOCKED BEFORE THE
   HARDWARE SPIKE / NOT IMPLEMENTED** until real stylus hardware and
   attributable Input Lab/Win32 evidence exist.
2. N2 — Detachable console/native auxiliary windows/multiple story windows:
   **DO NOT SHIP / NOT IMPLEMENTED** while Flutter 3.47 windowing remains
   experimental/internal.

## Exact resume instructions

From a fresh isolated worktree:

~~~powershell
git remote get-url origin
git fetch origin main
git rev-parse --verify HEAD
git rev-parse --verify origin/main
git diff --quiet origin/main..HEAD
git status --short --untracked-files=all
Get-Content docs\flutter-3.47-certification-report.md
Get-Content docs\flutter-3.47-implementation-progress.md
gh auth status
~~~

Require origin to be https://github.com/YuuKwn/TwinePlayer.git, require HEAD
to equal origin/main at the current reviewed base before new work, and verify
gh auth status reports YuuKwn. Keep
`codex/flutter-347-focus-debug`,
`codex/flutter-347-semantics-contracts`, and
`codex/flutter-347-flavor-decision` only for review. After this external-gates
PR is merged, do not open an implementation PR until the external prerequisites
below are satisfied. Keep the legacy Electron source and generated artifacts
out of scope for the next item.

## Exact external-gate resume prerequisites

Resume N1 only with a named Windows test machine and real stylus/inverted-eraser
hardware; recorded stylus, driver, WebView2, and DPI/display versions; the exact
application build hash; an attributable Input Lab capture with a matching Win32
comparison; privacy review for any added diagnostics; and a primary WebView2
pointer-contract mapping for kind, flags, pressure, tilt/orientation,
hover/contact, cancellation, and pointer identity.

Resume N2 only after Flutter exposes a stable production-supported desktop
windowing API and the reviewed design covers per-view HWND/WebView ownership,
state, focus, fullscreen, save, accessibility, DPI, crash recovery, and
deterministic validation. A disposable experimental spike remains a
non-product branch/sample and must not be merged.

## Explicit manual-gate boundary

Automated green results do not certify physical GPU/adapter behavior, WebView2
story content or texture correctness, visual text/antialiasing, keyboard,
screen-reader, focus, touch, mouse, wheel, pen, IME, DPI/display,
multi-monitor, real SugarCube saves, or the four-client matrix. Every
unperformed cell remains **NOT CERTIFIED** until attributable manual evidence
names the device, driver, WebView2 runtime, build hash, and exercised scenario.
For the build-identity item specifically, packaged UI/report comparison and
screen-reader traversal order were not exercised and remain **NOT CERTIFIED**.
For the focus-visualization item specifically, the debug visual pass,
keyboard traversal and focus restoration, Flutter/WebView focus boundary, and
state-preservation behavior were not exercised and remain **NOT CERTIFIED**.
For the semantics-contract item specifically, screen-reader role/label
announcements, hardware keyboard traversal and focus restoration, popup-menu
announcements, and packaged visual/accessibility behavior were not exercised
and remain **NOT CERTIFIED**.
For the N1 item specifically, real stylus/pen hardware behavior, Flutter-to-
native payload evidence, WebView2 pen mapping, and attributable Input Lab
evidence remain **NOT CERTIFIED** and block implementation/certification.
For the N2 item specifically, a stable production windowing API, per-view
HWND/WebView ownership, multi-window state/focus/fullscreen/save/accessibility
behavior, and certification evidence remain **NOT IMPLEMENTED / NOT CERTIFIED**.
This implementation pass is not full physical, visual, accessibility, GPU,
WebView2, or real-game certification.
