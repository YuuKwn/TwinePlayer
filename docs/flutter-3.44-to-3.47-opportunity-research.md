# TwinePlayer Flutter 3.44 to 3.47 opportunity research

## Purpose and evidence boundary

This document turns the Flutter 3.44 to 3.47 upgrade into a prioritized set of
future TwinePlayer work. It deliberately separates:

1. improvements to behavior that already exists; and
2. net-new features that become possible, or more practical, with the newer
   Flutter Windows stack.

Research date: **2026-08-13**

Repository: `F:\GitHub\TwinePlayer`

Reviewed source state: `main` at `605def3459b7f076f0e59c446287ce6823a5efab`
(`origin` is `https://github.com/YuuKwn/TwinePlayer.git`)

Product scope: `flutter_app` only. The historical Electron app is out of scope.

The exact comparison is Flutter **3.44.0**
(`559ffa3f75e7402d65a8def9c28389a9b2e6fe42`, Dart 3.12.0) through Flutter
**3.47.0** (`4cf24164269a5ebf0c16a028a00727d0e77bbb05`, Dart 3.13.0). The
[official Windows release manifest](https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json)
confirms both endpoints. The current app already targets Flutter 3.47.0 and
Dart 3.13.0, and `flutter_app/windows/runner/main.cpp` already enables Windows
Impeller explicitly.

The findings come from the live TwinePlayer source, the exact local Flutter SDK
commit range, and primary Flutter/Dart sources. They are not a claim that native
GPU, WebView2, accessibility, touch, stylus, or XR behavior has passed physical
testing. Recorded upgrade evidence is identified as recorded evidence rather
than re-run evidence.

## Executive conclusion

The upgrade itself is complete. Most of Flutter 3.47's Windows rendering and
text improvements arrive automatically, so TwinePlayer should validate them,
not reproduce them in application code. The best app-owned opportunities are:

1. close Gate 0 with a trustworthy all-green Flutter 3.47 semantics baseline
   (completed below);
2. certify the inherited Windows renderer, text, input, and windowing behavior;
3. align the vendored WebView's D3D11 device with Flutter's actual DXGI adapter;
4. put the running build identity into privacy-safe diagnostics;
5. add a debug-only focus visualization path and stronger semantics contracts;
6. optionally separate standard and certification builds with Windows flavors;
7. pursue full pen support only with a real native channel and hardware gate;
8. treat Flutter's multi-window API as a research spike, not a shippable 3.47
   dependency.

Recommended order:

| Order | Work item | Why now |
| --- | --- | --- |
| 0 | Gate 0: Flutter 3.47/Forui semantics compatibility | Completed 2026-08-13; the baseline is now trustworthy. |
| 1 | P0: 3.47 inherited-behavior certification | Next phase: the app already ships the new engine behavior, but runtime risk remains unmeasured. |
| 2 | WebView/Flutter graphics-adapter alignment | It directly addresses the highest-risk custom GPU boundary. |
| 3 | Build identity in diagnostics | Small change; makes every later certification report attributable. |
| 4 | Debug focus boxes and stronger semantics contracts | Improves diagnosis and prevents focus/accessibility regressions. |
| 5 | Optional Windows certification flavor | Useful only if separate artifacts solve a real release need. |
| 6 | Full stylus/pen pipeline | Valuable, but native-channel and physical-hardware gated. |
| 7 | Multi-window spike | Wait for API stability before product implementation. |

## Non-negotiable regression contracts

Every implementation brief below preserves:

- WebView2 playback and the vendored texture bridge;
- genuine touch forwarding, pointer cancellation, mouse, wheel, and focus;
- SugarCube save capture/load and safe overwrite confirmation;
- keyboard navigation, context menus, fullscreen exit, DPI/display recovery,
  accessibility, and deterministic focus restoration;
- the offline, privacy-safe Input Lab and its allowlisted diagnostics model;
- portable packaging and existing artifact boundaries;
- the supported Flutter app/legacy Electron boundary; and
- pinned dependencies unless a dependency change is separately justified and
  approved.

Do not weaken a meaningful test, introduce arbitrary sleeps, skip semantics,
or change production behavior merely to make a test green. Automated build or
smoke success must remain separate from native renderer and hardware evidence.

# Part 1 — Improve what already exists

## Gate 0 — Resolve the Flutter 3.47 and Forui save-dialog semantics blocker

**Priority:** prerequisite

**Status:** completed **2026-08-13**

**Readiness:** closed; P0 inherited-behavior certification is the next phase

### Why TwinePlayer benefits

The recorded 3.47 upgrade run had 66 passing Flutter tests and one failure:
`save overwrite asks for confirmation before writing`. Gate 0 reproduced that
failure, resolved the compatibility seam, and then passed the focused test, all
6 tests in `library_save_widget_test.dart`, all 67 Flutter tests, and analysis
under the pinned Flutter 3.47 SDK. A `pumpAndSettle()` experiment did not solve
the original failure and was not retained.

Before this was resolved, a later change could not cleanly distinguish its own
regression from the known baseline failure. With Gate 0 closed, the next task
can proceed to inherited-behavior certification without reopening this seam.

### Likely source and test seams

- `flutter_app/lib/src/twine_player_app.dart` (`SaveManagerDialog`)
- `flutter_app/test/library_save_widget_test.dart`
- the pinned Forui semantics behavior from `forui: ^0.22.3`
- Flutter 3.47's stricter semantics matching and merged-node validation

Flutter 3.47 added role checks to `isSemantics`/`matchesSemantics` in
[flutter/flutter#188825](https://github.com/flutter/flutter/pull/188825) and
made child mismatches stricter in
[flutter/flutter#188827](https://github.com/flutter/flutter/pull/188827).

### Verified diagnosis and narrow workaround

Forui 0.22.3 always applies a `MergeSemantics` boundary to `FTextField`. In the
save filename field, that boundary owns an unmerged label sibling alongside a
merged `EditableText` child. Flutter 3.47's sibling-merge update ordering exposes
the inconsistent tree during the initial semantics flush, producing the
`semantics.dart:3862` assertion; the later failures at `5053` and `4990` are
cascades. The failure occurs before the overwrite dialog is reached, so it is a
compatibility seam rather than a save/overwrite callback defect.

The app-owned workaround replaces only this save filename `FTextField` with an
equivalent Material `TextField`. It retains the existing controller, accessible
label, editable text role/value/actions, `_write` submission callback, keyboard
focus, and the Forui small-field touch sizing and padding. The test now enables
semantics, verifies the field label/role/value/actions, verifies both confirmation
button semantics after the dialog route becomes visible, preserves pointer
activation and `writeCount`, and proves the outer `SaveManagerDialog` remains
usable after cancel. No SDK, dependency, other Forui field, or Electron change
was made.

### Completed scope and evidence

1. Reproduced the exact failure under the pinned Flutter 3.47.0 SDK and Forui
   0.22.3 lock.
2. Inspected the live semantics tree before and after the overwrite route opens,
   including the merged Forui nodes and the route's initial zero-opacity frame.
3. Applied the narrow Material-field fallback and deterministic semantics
   assertions described above.
4. Re-ran the focused test first, then the save-widget file and full Flutter
   suite, with `flutter analyze` completing without issues.

### Acceptance criteria

- The focused overwrite test passes for the right semantic and behavioral
  reason.
- Save, overwrite confirmation, cancel, load, delete, focus restoration, and
  accessible dialog naming remain intact.
- No sleeps, skips, blanket semantics exclusions, or reduced assertions.
- The full Flutter suite has no new failures.

### Automated validation

Run from `flutter_app`:

```powershell
flutter test test/library_save_widget_test.dart --plain-name "save overwrite asks for confirmation before writing"
flutter test test/library_save_widget_test.dart
flutter test
flutter analyze
```

If the Flutter wrapper hangs on this machine, use the direct Dart
`flutter_tools.dart --no-version-check` entrypoint already documented in
`flutter_app/README.md`.

Gate 0 evidence captured on **2026-08-13** with that direct entrypoint:

- focused overwrite test: `+1`, passed;
- `test/library_save_widget_test.dart`: `+6`, passed;
- full `flutter test`: `+67`, passed;
- `flutter analyze`: `No issues found!`.

### Remaining manual gates (not covered by automated evidence)

- Keyboard and screen-reader traversal through the overwrite dialog.
- Save overwrite/cancel against a disposable real SugarCube fixture.
- Focus return to the initiating control after dialog close.

### Future-thread brief

```text
Start with P0 — Certify the behavior inherited from Flutter 3.47. Gate 0 is
complete: do not reopen the resolved save-dialog semantics blocker unless a new
regression reproduces it. Work only in F:\GitHub\TwinePlayer\flutter_app and
the explicitly named P0 evidence paths. Establish an attributable Windows
artifact, capture renderer/WebView2/GPU/DPI and build identity evidence, and
exercise the manual keyboard, screen-reader, touch, visual, and disposable real
SugarCube gates. Keep automated, physical, accessibility, and GPU evidence
separate. Do not touch the legacy Electron app, push, or open a PR unless
requested.
```

## P0 — Certify the behavior inherited from Flutter 3.47

**Priority:** completed evidence pass after Gate 0

**Readiness:** automated evidence captured 2026-08-25; manual gates remain
**NOT CERTIFIED**; next dependency is DXGI adapter alignment

### Certification handoff — 2026-08-25

The P0 evidence pass ran from clean YuuKwn origin/main at
236194855836844cb9537263864fa80d0b858cc4. The detailed attributable results,
package inventory, hashes, runtime telemetry, preserved environment notes, and
manual boundary are in
[flutter-3.47-certification-report.md](flutter-3.47-certification-report.md).
The durable resume state is in
[flutter-3.47-implementation-progress.md](flutter-3.47-implementation-progress.md).

Automated Flutter, vendored WebView, root Node/DOM, Windows release, packaging,
hash, and three smoke-cycle evidence passed. One packaged run emitted reliable
Impeller OpenGLESSDF telemetry; this does not certify GPU, WebView content,
visual, accessibility, input, DPI, or client-matrix behavior. Continue with
the next section, P0 DXGI adapter alignment, without changing this evidence
boundary.

### Why TwinePlayer benefits

Flutter 3.47 contains several Windows changes that TwinePlayer receives without
an app-code migration:

- an explicit project switch for Impeller
  ([#188044](https://github.com/flutter/flutter/pull/188044)) and Impeller as
  the Windows default ([#188140](https://github.com/flutter/flutter/pull/188140));
- an OpenGL fallback black-screen fix
  ([#187288](https://github.com/flutter/flutter/pull/187288));
- OpenGL SDF rendering and gamma-corrected Windows text
  ([#187877](https://github.com/flutter/flutter/pull/187877),
  [#187871](https://github.com/flutter/flutter/pull/187871));
- offscreen MSAA when implicit MSAA is unavailable
  ([#190374](https://github.com/flutter/flutter/pull/190374));
- a corrupted empty-frame window-size fix
  ([#187954](https://github.com/flutter/flutter/pull/187954));
- corrected Korean IME caret placement
  ([#186353](https://github.com/flutter/flutter/pull/186353)); and
- a Windows tooltip lifetime fix
  ([#188476](https://github.com/flutter/flutter/pull/188476)).

These should improve chrome text, antialiasing, tooltips, text entry, resize,
and fallback robustness. They also touch the same renderer and window lifecycle
that hosts TwinePlayer's custom WebView texture, fullscreen code, and multiple
input profiles. Compilation proves configuration compatibility, not that the
actual runtime path is correct on each device.

### Current app seams

- `flutter_app/windows/runner/main.cpp`
- `flutter_app/windows/runner/flutter_window.cpp`
- `flutter_app/vendor/webview_windows/windows/texture_bridge_gpu.cc`
- `flutter_app/vendor/webview_windows/windows/texture_bridge_fallback.cc`
- `flutter_app/lib/src/twine_player_app.dart`
- `flutter_app/assets/input_lab.html`
- `flutter_app/tool/package_windows_release.ps1`
- `docs/touch-phases-7-10-roadmap.md`

### Proposed scope

This is primarily an evidence pass. Only change source if a reproducible defect
is found and the fix can be kept focused.

1. Establish a clean, attributable release artifact and record Flutter,
   WebView2, Windows, GPU/driver, display/DPI, commit, file inventory, and hash.
2. Capture evidence that the running build selected the intended renderer when
   reliable runtime telemetry is available. Do not infer it from `main.cpp`.
3. Exercise WebView content for blank/black/upside-down/stale frames, clipping,
   resize, fullscreen, navigation, dispose/reopen, and console side-by-side.
4. Exercise chrome text, tooltips, search/console/scenario-label text fields,
   selection, Korean IME composition, and high-DPI multi-monitor transitions.
5. Update the certification matrix only for modes actually tested.

### Acceptance criteria

- Existing automated suites and release packaging pass after Gate 0.
- The artifact has exact hashes and an inventory.
- Renderer evidence and manual visual/hardware results are reported separately.
- A failed cell stays **NOT CERTIFIED** with the failure preserved.
- No source change is made solely to manufacture a positive result.

### Automated validation

From `flutter_app`:

```powershell
flutter pub get
flutter analyze
flutter test
flutter build windows --release -v
.\tool\package_windows_release.ps1 -FlutterExecutable flutter -SmokeCycles 3
```

Run `flutter test` separately from `flutter_app/vendor/webview_windows` for the
vendored plugin suite.

From the repository root:

```powershell
npm run test:flutter-bridge-dom
npm run test:flutter-story-assistance
npm run test:windows-resilience
npm test
```

### Manual gates

Use the existing four-client matrix in `docs/touch-phases-7-10-roadmap.md`.
Add Intel/AMD/NVIDIA and hybrid-GPU coverage where available. Record visual
text/antialiasing findings instead of relying on screenshots alone for input,
focus, or accessibility claims.

### Future-thread brief

```text
Perform a Flutter 3.47 certification pass for the supported TwinePlayer Flutter
Windows app at F:\GitHub\TwinePlayer. Begin from a clean YuuKwn main and do not
change source unless a defect is reproduced. Run the Flutter, vendored WebView,
Node/DOM, release-build, packaging, manifest, hash, and smoke gates. Then test
the real WebView2 surface for black/blank/upside-down/stale frames, resize,
fullscreen, focus, touch/mouse/wheel, save/load, dispose/reopen, text/tooltip
rendering, Korean IME, and DPI/display changes. Record renderer telemetry only
if observed at runtime. Keep every unperformed hardware/GPU/client cell NOT
CERTIFIED, and report automated evidence separately from manual evidence.
```

## P0 — Align the vendored WebView D3D11 device with Flutter's DXGI adapter

**Priority:** high

**Readiness:** implementation complete in a focused native-plugin lane; parent
review and manual hardware/runtime gates remain open

### Why TwinePlayer benefits

Flutter 3.47 exposes the renderer's DXGI adapter to Windows plugins through
`FlutterDesktopPluginRegistrarGetGraphicsAdapter` and the C++ wrapper
`PluginRegistrarWindows::GetGraphicsAdapter` in
[flutter/flutter#185580](https://github.com/flutter/flutter/pull/185580).

TwinePlayer's vendored plugin currently calls
`D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, ...)` in
`flutter_app/vendor/webview_windows/windows/util/d3dutil.h`. That asks Windows
to choose a default adapter independently of Flutter. On hybrid or multi-GPU
systems, Flutter/Impeller and the WebView capture pipeline can therefore select
different adapters. The plugin copies captured WebView frames into a shared
D3D11 texture and hands that surface to Flutter, so adapter mismatch is a
credible source of shared-resource creation/import failures, black frames, or
unexpected fallback.

### Proposed scope

- Retrieve the Flutter renderer adapter during plugin registration.
- Pass adapter ownership explicitly into `WebviewWindowsPlugin`,
  `WebviewPlatform`, and/or `GraphicsContext` rather than hiding it in a global.
- Create the D3D11 device with that adapter and the correct driver-type rules.
- Release COM ownership deterministically.
- Fail closed when adapter retrieval, adapter-bound device creation, or WinRT
  device conversion fails. Do not silently select another hardware adapter or
  retry with WARP; the compile-time PixelBuffer path must use the same exact
  Flutter adapter.
- Add a testable adapter-selection/device-creation seam and native tests or an
  equivalent deterministic harness. Keep existing Dart plugin tests.

Likely files:

- `flutter_app/vendor/webview_windows/windows/webview_windows_plugin.cc`
- `flutter_app/vendor/webview_windows/windows/webview_platform.{h,cc}`
- `flutter_app/vendor/webview_windows/windows/graphics_context.{h,cc}`
- `flutter_app/vendor/webview_windows/windows/util/d3dutil.h`
- `flutter_app/vendor/webview_windows/windows/texture_bridge_gpu.{h,cc}`
- `flutter_app/vendor/webview_windows/windows/texture_bridge_fallback.{h,cc}`
- `flutter_app/vendor/webview_windows/windows/CMakeLists.txt`
- `flutter_app/vendor/webview_windows/test/webview_windows_test.dart`

### Acceptance criteria

- The GPU bridge uses the exact Flutter renderer adapter when retrieval and
  device creation succeed.
- Adapter failure has an explicit, tested behavior; it does not create a second
  unverified GPU device and pretend compatibility.
- GPU and PixelBuffer texture paths retain lifecycle, resize, stop/resume, and
  disposal behavior while consuming the same adapter-bound device.
- WebView focus, pointer forwarding, SugarCube bridge, and packaging are
  unchanged.
- No Flutter SDK source is patched.

### Automated validation

- New focused native adapter/device tests or deterministic seams.
- Existing vendored WebView Dart tests.
- `flutter analyze`, the focused player/WebView tests, full `flutter test`, and
  Windows release build.
- DOM bridge, resilience, packaging, hash, and smoke gates from the P0
  certification item.

### Implementation evidence (2026-08-25)

- Registration calls `PluginRegistrarWindows::GetGraphicsAdapter` and takes
  ownership of the returned reference in `winrt::com_ptr<IDXGIAdapter>`. That
  ownership is moved explicitly through `WebviewWindowsPlugin`,
  `WebviewPlatform`, and `GraphicsContext`; no raw adapter is retained.
- `GraphicsContext` now calls `D3D11CreateDevice` with the exact non-null
  Flutter adapter, `D3D_DRIVER_TYPE_UNKNOWN`, the existing BGRA and VIDEO
  flags, no feature-level list, and `D3D11_SDK_VERSION`. Adapter absence,
  device failure, and WinRT conversion failure stay fail-closed through the
  existing `unsupported_platform` contract. There is no nullptr hardware
  selection and no WARP retry. The GPU shared-handle and PixelBuffer
  readback implementations use this same device context.
- `windows/native_tests` is an isolated CMake/CTest target that does not link
  WebView2. Its MSVC release executable passed 1/1 test, covering exact
  adapter pointer forwarding, `UNKNOWN`, flags/feature-level arguments,
  null-adapter short-circuit, null output, and HRESULT propagation. The
  default GPU release build and a separate
  `FLUTTER_WEBVIEW_WINDOWS_USE_TEXTURE_FALLBACK=ON` PixelBuffer release build
  both passed. The vendored Dart suite passed 7/7; analyzer 0 issues; full
  Flutter tests 67/67; root DOM/resilience/Node gates passed; packaging
  verified 26 files and 3/3 smoke cycles.
- Exact commands used for the isolated native harness (replace only
  `<native-build-dir>` with a disposable output directory):
  ```powershell
  cmake -S flutter_app/vendor/webview_windows/windows/native_tests -B <native-build-dir> -G "Visual Studio 17 2022" -A x64
  cmake --build <native-build-dir> --config Release --parallel 2
  ctest --test-dir <native-build-dir> -C Release --output-on-failure
  ```
- Exact commands used for the separate PixelBuffer release configuration
  (replace only `<pixelbuffer-build-dir>` with a disposable output directory):
  ```powershell
  cmake -S windows -B <pixelbuffer-build-dir> -G "Visual Studio 17 2022" -A x64 -DFLUTTER_WEBVIEW_WINDOWS_USE_TEXTURE_FALLBACK=ON
  cmake --build <pixelbuffer-build-dir> --config Release --parallel 2 --target INSTALL
  ```
- This evidence is source, harness, compile, and bounded launch evidence only.
  Runtime adapter identity, GPU interop, WebView frames/content, visual/input/
  accessibility/DPI behavior, and Intel/AMD/NVIDIA/hybrid coverage remain
  **NOT CERTIFIED**. The build emitted the existing CMake CMP0175 developer
  warning for the plugin NuGet custom command; Node 21 also emitted the
  repository's existing dependency engine/audit warnings.

### Manual gates

- Intel-only, AMD-only, NVIDIA-only, and hybrid-GPU machines when available.
- Confirm the adapter selected by Flutter and the plugin with bounded diagnostic
  output that contains no story data or paths.
- Black/blank/stale frames, resize, fullscreen, monitor transfer, sleep/resume,
  dispose/reopen, and the separate compile-time PixelBuffer configuration/path.

### Parent review and manual follow-up brief

```text
Review the focused vendored webview_windows change against the Flutter 3.47
PluginRegistrarWindows::GetGraphicsAdapter contract. Confirm that the single
winrt::com_ptr<IDXGIAdapter> remains the ownership path through registration,
WebviewPlatform, and GraphicsContext, that D3D11 uses that adapter with
D3D_DRIVER_TYPE_UNKNOWN, and that adapter/device/WinRT failures stay on the
existing unsupported_platform path. Keep WebView2, touch/mouse/focus,
SugarCube save/load, fullscreen, and both texture bridges unchanged beyond
their shared device context. Runtime Intel/AMD/NVIDIA/hybrid adapter identity,
frame correctness, visual/input/accessibility/DPI behavior, and real-game
coverage remain manual NOT CERTIFIED gates. After review, resume with P1 build
identity in settings and diagnostics.
```

## P1 — Add the running build identity to settings and diagnostics

**Priority:** medium-high

**Readiness:** ready for a small Flutter implementation thread

### Why TwinePlayer benefits

Flutter 3.47 exposes the compiled app version as `appBuildName` and
`appBuildNumber` from `package:flutter/services.dart`; see
[flutter/flutter#187935](https://github.com/flutter/flutter/pull/187935).
TwinePlayer already creates portable artifacts and asks manual testers to record
the exact build. Today the copied input report contains events and an optional
scenario label, but not the running app version.

Adding immutable build identity makes every copied certification report
self-identifying without a new dependency or a runtime file lookup.

### Proposed scope

- Introduce a small immutable build-identity value at the dependency boundary;
  populate it from `appBuildName`/`appBuildNumber` in production and inject it
  in tests.
- Show it in Settings or diagnostics as `1.0.0+10` when both values exist.
- Add allowlisted `appBuildName` and `appBuildNumber` fields to copied reports.
- Preserve the current privacy contract: no paths, story text, keys,
  coordinates, timestamps, or telemetry.
- Define deterministic behavior when either compile-time value is absent.

Likely files:

- `flutter_app/lib/main.dart`
- `flutter_app/lib/src/twine_player_app.dart`
- `flutter_app/lib/src/services/input_diagnostics.dart`
- `flutter_app/test/input_diagnostics_test.dart`
- settings/diagnostics widget tests in `flutter_app/test`

### Acceptance criteria

- UI and copied report show the version of the code actually running.
- Build identity is immutable, allowlisted, bounded, and test-injectable.
- Existing report serialization and scenario-label behavior remain compatible.
- Tests cover complete, partial, and absent build values.
- No `package_info_plus` dependency is added merely for data Flutter now
  supplies.

### Automated validation

```powershell
flutter test test/input_diagnostics_test.dart
flutter test test/interaction_profile_test.dart
flutter test
flutter analyze
```

Also build a release and verify that its displayed identity matches
`pubspec.yaml` or explicit `--build-name`/`--build-number` overrides.

### Manual gates

- Copy a report from the packaged release and compare it with the artifact
  manifest/version resource.
- Confirm screen-reader reading order in Settings and Diagnostics.

### Future-thread brief

```text
Add Flutter 3.47 appBuildName/appBuildNumber to TwinePlayer's Settings/Input
diagnostics through a small dependency-injected build-identity value. The copied
report must identify the exact running build while preserving its strict privacy
allowlist and session-only behavior. Cover complete, partial, and missing values
without adding package_info_plus. Update focused diagnostics/widget tests, then
run the full Flutter suite and analyzer. Verify a packaged release reports the
same version as its artifact metadata. Do not touch Electron, publishing,
auto-update, or network behavior.
```

## P1 — Add a debug-only focus visualization path

**Priority:** medium

**Readiness:** ready for a bounded developer-tooling thread

### Why TwinePlayer benefits

Flutter 3.47 adds `debugPaintFocusBoxes`; see
[flutter/flutter#188288](https://github.com/flutter/flutter/pull/188288). It
colors the primary focus, focus ancestors, traversable nodes, skipped nodes,
and non-focusable nodes. TwinePlayer has unusually important focus boundaries:
Flutter chrome, Forui dialogs, a texture-backed WebView, console overlays,
keyboard context actions, Compact/Comfortable profiles, and fullscreen return.

The flag has no release-build effect. Flutter also warns that toggling it wraps
`Focus` children and can cause state loss in unkeyed stateful children, so it
should be selected before `runApp`, not exposed as an arbitrary runtime switch.

### Proposed scope

- Add a bounded debug-only entry mechanism, such as a compile-time
  `TWINEPLAYER_FOCUS_DEBUG` boolean read in `flutter_app/lib/main.dart` before
  `runApp`.
- Require both the requested flag and `kDebugMode`.
- Document one exact launch command and use it with Input Lab.
- Do not include focus-tree details in privacy-safe copied reports.
- Add a testable decision helper; use a manual debug run for the actual paint.

### Acceptance criteria

- Ordinary debug and all release builds retain current behavior.
- The focus overlay is enabled before widget construction in the explicit debug
  mode only.
- No runtime toggle risks state loss.
- The documented flow covers library, settings, player chrome, console, save
  dialog, image preview, fullscreen return, and both interaction profiles.

### Automated validation

- Unit-test the compile-time/debug gating helper where practical.
- Run focused focus/traversal widget tests, the full Flutter suite, and analyzer.
- Build release and verify the focus visualization has no effect.

### Manual gates

- Visually inspect focus boxes in a debug Input Lab run.
- Keyboard-only traversal and focus restoration.
- WebView-to-chrome focus transitions and dialog close.

### Future-thread brief

```text
Add a bounded debug-only TwinePlayer focus-visualization mode using Flutter
3.47's debugPaintFocusBoxes. Decide the mode before runApp, require kDebugMode,
and never expose a release or arbitrary runtime toggle because the Flutter API
can rewrap Focus children and lose unkeyed state. Document an exact Input Lab
launch command and cover library, settings, player chrome, console, save dialog,
image preview, fullscreen return, and Compact/Comfortable traversal. Add tests
for the gating seam, run focused/full Flutter tests and analyzer, and verify a
release build is unaffected.
```

## P1/P2 — Strengthen semantics regression contracts

**Priority:** medium, after Gate 0

**Readiness:** ready only after the baseline semantics blocker is resolved

### Why TwinePlayer benefits

Flutter 3.47's role-aware and stricter semantics matchers can turn existing
accessibility intent into more exact regression contracts. It also stabilizes
the scrollable semantics role
([flutter/flutter#187963](https://github.com/flutter/flutter/pull/187963)).
This matters for TwinePlayer's library cards, context-action surfaces, dialog
buttons, settings scroll areas, command bar, console logs, and save manager.

### Proposed scope

- Add role assertions only where role is part of the user-facing contract.
- Assert relevant child structure, labels, enabled state, selected/toggled
  state, traversal, and dialog boundaries.
- Keep tests resilient to decorative Forui implementation details.
- Do not begin until Gate 0 establishes how the pinned Forui version should
  compose merged semantics.

Likely tests include:

- `flutter_app/test/adaptive_controls_widget_test.dart`
- `flutter_app/test/library_save_widget_test.dart`
- `flutter_app/test/player_chrome_widget_test.dart`
- `flutter_app/test/console_widget_test.dart`
- `flutter_app/test/command_bar_preferences_test.dart`

### Acceptance criteria

- Tests describe observable accessible behavior, not private widget structure.
- Buttons, dialogs, scrollables, toggles, and context-action surfaces have
  intentional roles and labels.
- Keyboard focus order remains deterministic in both profiles.
- No semantics exclusion or broad matcher relaxation.

### Automated validation

Run the focused files above, full `flutter test`, and `flutter analyze`.
Use a screen-reader/manual keyboard pass as a separate gate.

### Future-thread brief

```text
After the known Flutter 3.47/Forui save-dialog semantics blocker is resolved,
strengthen TwinePlayer's accessibility tests with Flutter 3.47 role-aware and
strict semantics matchers. Assert only observable contracts: labels, roles,
enabled/toggled state, dialog boundaries, scrollable roles, and deterministic
focus order for library cards, adaptive controls, command bar, console,
settings, and save manager. Avoid coupling to decorative Forui internals and do
not relax or exclude semantics. Run all focused files, the full Flutter suite,
analyzer, and report screen-reader/keyboard checks as a manual gate.
```

## P2 optional — Use Windows flavors for distinct standard and lab artifacts

**Priority:** optional

**Readiness:** design decision first

### Why TwinePlayer might benefit

Flutter 3.47 adds `flutter build windows --flavor` and flavor-separated output
directories; see
[flutter/flutter#187034](https://github.com/flutter/flutter/pull/187034). It
also exposes the selected `appFlavor` to Dart. A `standard` and `lab` pair could
let certification tooling, diagnostic labels, or experimental gates coexist
without overwriting the normal portable artifact.

This is useful only if separate binaries solve a real operational need. Input
Lab is already bundled, offline, opt-in, and disabled by default, so flavors
must not be introduced merely because the tool supports them.

### Proposed scope if approved

- Define the exact difference between `standard` and `lab`; keep game behavior,
  save format, and settings compatibility identical.
- Hand-adopt only the Flutter 3.47 CMake/runner flavor plumbing required by the
  customized Windows host. Do not regenerate and overwrite the fullscreen,
  icon, Impeller, or packaging customizations.
- Make `tool/package_windows_release.ps1` flavor-aware and keep existing
  no-flavor output compatible.
- Give each artifact a distinct binary name, PE metadata, window title or
  visible badge, directory, ZIP, manifest, and hash.
- Do not enable `debugPaintFocusBoxes` in release; it has no release effect.

### Acceptance criteria

- Standard, lab, and existing unflavored builds do not collide on disk.
- The standard build is behaviorally equivalent to today's release.
- Flavor identity is visible and present in the artifact manifest.
- Save and preference storage compatibility is intentional and tested.
- Packaging replaces only its exact target directory.

### Automated validation

- Build all approved variants and compare inventories.
- Run relevant Flutter tests with injected flavor values.
- Run full analyzer/tests, packaging, manifest/hash, and smoke cycles.

### Manual gates

- Confirm the user can always identify the lab build.
- Confirm side-by-side launch/storage behavior and no accidental save split or
  collision.

### Future-thread brief

```text
First decide whether TwinePlayer genuinely needs separate standard and
certification/lab Windows artifacts. If yes, adopt Flutter 3.47 Windows flavor
plumbing narrowly into the customized runner without regenerating or losing
fullscreen, icon, Impeller, WebView, or packaging behavior. Make output paths,
binary/PE identity, window/badge identity, ZIPs, manifests, hashes, and package
replacement flavor-specific while preserving the current unflavored path.
Define and test save/preferences compatibility. Build and smoke every variant,
compare inventories, and do not treat a lab flavor as hardware certification.
```

## Already inherited: validate, do not re-implement

| Flutter 3.47 change | TwinePlayer surface | Required action |
| --- | --- | --- |
| Windows Impeller switch/default | Flutter chrome plus texture-backed WebView | Already configured explicitly; collect runtime evidence and GPU coverage. |
| Windows SDF/gamma text and MSAA fallback | Forui/Material chrome, icons, console, dialogs | Visual regression pass across DPI/GPU; no app shader rewrite. |
| OpenGL fallback black-screen fix | WebView external texture and Flutter surface fallback | Exercise failure/fallback paths; do not claim success from build output. |
| Korean IME caret fix | Search, console, save name, scenario label | Add to manual input matrix; story forms remain a separate WebView2 path. |
| Empty-frame window-size and tooltip lifetime fixes | Resize/fullscreen/reopen and button tooltips | Exercise lifecycle and DPI transitions; no duplicate host workaround. |
| Text-selection/scrollable semantics fixes | Selectable console/diagnostic text and scroll areas | Keep focused regression tests; avoid bespoke replacements without a reproduced defect. |

# Part 2 — Net-new future features

## N1 — Complete stylus and pen support end to end

**Readiness:** feasible research/implementation, but hardware gated

**Do not claim:** pen support from Flutter events alone

### New platform capability

Flutter 3.47's Windows engine reports stylus barrel/eraser button flags and
inverted stylus kinds; see
[flutter/flutter#187629](https://github.com/flutter/flutter/pull/187629).

TwinePlayer already recognizes `stylus` and `invertedStylus` in its privacy-safe
diagnostics and Comfortable-profile selection. However, the vendored WebView
bridge only sends genuine touch through `SetPointerUpdate`, and native code
hard-codes `ICoreWebView2PointerInfo::PointerKind` to `PT_TOUCH`. Stylus events
take the non-touch mouse path. The existing roadmap correctly refuses to guess
pen masks, flags, pressure, tilt, hover, or eraser semantics.

### Prerequisites

- Real stylus hardware and a repeatable Windows test machine.
- An explicit Flutter-to-native payload for device kind, buttons, pressure,
  tilt/orientation, contact/in-range state, and required coordinates.
- Primary WebView2 `ICoreWebView2PointerInfo` contract review.
- Privacy review for any additional diagnostics fields.
- Gate 0 and the graphics-adapter work should be stable first.

### Staged path

1. **Spike:** capture Flutter 3.47 stylus/inverted-stylus events in Input Lab;
   record only allowlisted categories/counts and compare with Win32 flags.
2. **Channel contract:** version and test a typed Dart/native payload. Preserve
   touch and mouse payloads byte-for-behavior.
3. **Native implementation:** populate `PT_PEN`, pen flags/masks, pressure,
   rotation/tilt, hover/contact, barrel, eraser, cancel/up, and pointer identity
   from real input rather than assumptions.
4. **Automation:** Dart state-machine tests, native mapping tests, WebView2
   fixture tests, cancellation/lost-contact and mouse-coexistence tests.
5. **Certification:** real pen, inverted eraser, barrel button, hover, drag,
   scroll equivalent, fullscreen, DPI, cancel, dispose/reopen, and story forms.

### Acceptance criteria

- Touch remains `PT_TOUCH`; mouse remains mouse; pen is `PT_PEN` only when its
  full contract is available.
- No stuck contacts/buttons after cancel, focus loss, fullscreen, or dispose.
- Diagnostics remain allowlisted, bounded, in-memory, and story-blind.
- Unsupported/incomplete pen data follows the existing conservative path.
- Physical evidence names hardware, driver, WebView2, build hash, and DPI.

### Future-thread brief

```text
Design and implement full stylus/pen forwarding for TwinePlayer on Flutter 3.47
without changing existing touch or mouse behavior. Start with a read-only event
spike on real hardware and the bundled Input Lab. Define a versioned Dart/native
payload for device kind, buttons, pressure, tilt/orientation, hover/contact,
cancel, and pointer identity; then populate WebView2 ICoreWebView2PointerInfo as
PT_PEN from real data. Never guess pen masks or claim pen support because
Flutter reports PointerDeviceKind.stylus. Add Dart state-machine and native
mapping tests, preserve privacy-safe diagnostics, run all Flutter/WebView/DOM/
packaging gates, and leave hardware modes NOT CERTIFIED until the real pen,
eraser, barrel, hover, DPI, fullscreen, cancellation, and reopen matrix passes.
```

## N2 — Detachable console, native auxiliary dialogs, or multiple story windows

**Readiness:** research spike only

**Shipping status on Flutter 3.47:** **DO NOT SHIP**

### New platform capability

Flutter's desktop windowing work includes regular, dialog, popup, tooltip, and
sized-to-content windows, with Windows popup support in
[flutter/flutter#184516](https://github.com/flutter/flutter/pull/184516) and
sized-to-content regular/dialog windows in
[flutter/flutter#186829](https://github.com/flutter/flutter/pull/186829).
Possible TwinePlayer experiences include:

- a detachable developer console beside the story;
- a native save manager, diagnostics viewer, or image preview window;
- a second story window while the library remains open; and
- native popups that can escape the main Flutter view bounds.

Flutter 3.47's own source says the windowing API is internal/experimental, must
not be used in production or published packages, may break even in patch
versions, and requires an experimental feature path. The tracking issue is
[flutter/flutter#30701](https://github.com/flutter/flutter/issues/30701).
That warning overrides the appeal of the feature.

TwinePlayer also has app-specific blockers: the vendored WebView plugin captures
the registrar's current view/HWND, player state assumes one route/session,
fullscreen is host-window-specific, and save/console/focus lifecycles are not
multi-view aware.

### Prerequisites

- Flutter declares a stable, production-supported desktop windowing API.
- The Windows runner and plugin can address the correct view/HWND per WebView.
- State ownership for library, player, WebView controller, save dialog, console,
  fullscreen, focus, and shutdown is explicitly designed.
- Multi-window accessibility, DPI/display, crash recovery, and packaging have a
  deterministic test plan.

### Staged path

1. **No-product spike:** a disposable branch or sample, never merged into the
   production app, proving regular/dialog/popup lifecycle on the pinned SDK.
2. **Plugin spike:** prove one WebView per correct Flutter view/HWND with clean
   creation, focus, texture ownership, and disposal.
3. **Architecture decision:** choose one bounded experience, preferably a
   detachable console before concurrent story sessions.
4. **Implementation after stabilization:** introduce explicit per-window state
   and close/focus/fullscreen/save policies.
5. **Certification:** multi-monitor/DPI, minimize/restore, activation order,
   parent close, crash/reopen, keyboard/screen reader, GPU matrix, and packages.

### Acceptance criteria for a future production implementation

- No internal Flutter imports, ignore directives, or experimental feature flag
  are required by the stable API.
- Each WebView binds to the intended view/window and disposes independently.
- Closing an auxiliary window cannot lose or corrupt a player/save session.
- Focus, shortcuts, accessibility, fullscreen, and DPI behavior are defined for
  every window.
- Single-window behavior remains available and covered.

### Future-thread brief

```text
Do a non-production TwinePlayer desktop-windowing feasibility spike only after
re-checking Flutter's current stable windowing status. Flutter 3.47's API is
internal/experimental and must not ship. Use a disposable branch/sample to
prove regular/dialog/popup lifecycle, then inspect whether the vendored
webview_windows plugin can bind each WebView to the correct Flutter view/HWND.
Map state ownership for player, console, saves, focus, fullscreen, DPI, and
close/disposal. Recommend at most one first experience, such as a detachable
console. Do not merge product code or claim readiness while internal imports,
experimental flags, or unresolved multi-view WebView ownership remain.
```

## N3 — A separately identifiable certification release track

**Readiness:** optional operational feature

**Dependency:** the P2 Windows flavor decision

A lab release track could make hardware certification repeatable without
confusing its artifacts with normal releases. It could include a visible lab
badge, version/flavor identity in copied reports, dedicated artifact names, and
a manifest that lists the certification checklist version. It must not enable
privacy-sensitive logging, networking, debug paint in release, or behavior that
makes the lab result unrepresentative of the standard build.

### Staged path

1. Define the smallest lab-only difference and prove it cannot affect story or
   input behavior.
2. Adopt Windows flavor output and package naming.
3. Add build/flavor identity to reports and manifests.
4. Compare standard and lab binary inventories and run the same smoke suite.
5. Use the lab track for evidence collection; certify the standard artifact
   separately whenever their behavior can differ.

### Future-thread brief

```text
Evaluate a separately identifiable TwinePlayer certification release track
using Flutter 3.47 Windows flavors. Keep the lab and standard runtime behavior
equivalent except for explicit identity/evidence UI; do not add telemetry,
networking, privacy-sensitive diagnostics, or debug paint to release. Make
binary names, PE metadata, folders, ZIPs, hashes, manifests, and copied reports
unambiguous. Prove save/settings compatibility and compare standard/lab
inventories and smoke behavior. Do not infer that a lab result certifies a
different standard binary.
```

# Not recommended or low-value adoption

| Candidate | Decision | Reason |
| --- | --- | --- |
| Dart 3.13 primary constructors | Do not schedule a broad migration | The [Dart SDK changelog](https://github.com/dart-lang/sdk/blob/main/CHANGELOG.md) describes them as a brevity feature with no new semantics. Rewriting `models.dart`, stores, or the 4,894-line app file adds churn without user value. Use them only naturally in new code after team/style agreement. |
| Experimental `flutter_gpu` or custom shaders | Do not adopt for novelty | TwinePlayer has no custom shader/Flutter GPU code. WebView rendering is an external texture problem; a new shader stack does not fix its adapter, input, or lifecycle contracts. |
| Regenerate all Windows templates | Do not do this | The runner has intentional fullscreen, DPI, icon, Impeller, WebView, and packaging customizations. Hand-adopt a verified template delta only when a selected feature requires it. |
| Rewrite Forui/Material UI to use newly noticed widgets | No generic migration | Require a reproduced UX/accessibility problem and a focused behavior benefit. Preserve the current profiles and public behavior. |
| Replace custom console completion with `RawAutocomplete` solely because of framework fixes | Not justified | The current completion UI has touch/wheel/profile-specific behavior. A replacement needs its own product case and regression proof. |
| Use the new Windows platform-thread task API without a reproduced threading defect | Keep as a targeted plugin tool | [flutter/flutter#187365](https://github.com/flutter/flutter/pull/187365) gives embedders a safe platform-thread scheduling API. Use it if a future WebView callback audit proves work is arriving on the wrong thread; speculative marshalling would add shutdown and cancellation complexity. |
| Treat successful build/smoke as renderer certification | Never | Source, compilation, and smoke launch do not prove the actual GPU backend, WebView texture orientation/content, physical input, or accessibility behavior. |

# Source map

Primary sources used for this research:

| Area | Source |
| --- | --- |
| Exact Flutter/Dart release endpoints | [Flutter Windows release manifest](https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json) |
| App build name/number constants | [flutter/flutter#187935](https://github.com/flutter/flutter/pull/187935) |
| Plugin renderer adapter API | [flutter/flutter#185580](https://github.com/flutter/flutter/pull/185580) |
| Debug focus boxes | [flutter/flutter#188288](https://github.com/flutter/flutter/pull/188288) |
| Role-aware/strict semantics matchers | [#188825](https://github.com/flutter/flutter/pull/188825), [#188827](https://github.com/flutter/flutter/pull/188827) |
| Stable scrollable semantics role | [flutter/flutter#187963](https://github.com/flutter/flutter/pull/187963) |
| Windows flavors | [flutter/flutter#187034](https://github.com/flutter/flutter/pull/187034) |
| Windows stylus buttons/inverted stylus | [flutter/flutter#187629](https://github.com/flutter/flutter/pull/187629) |
| Windows platform-thread task API | [flutter/flutter#187365](https://github.com/flutter/flutter/pull/187365) |
| Windows Impeller project switch/default | [#188044](https://github.com/flutter/flutter/pull/188044), [#188140](https://github.com/flutter/flutter/pull/188140) |
| Windows Impeller/OpenGL/SDF/text/MSAA | [#187288](https://github.com/flutter/flutter/pull/187288), [#187877](https://github.com/flutter/flutter/pull/187877), [#187871](https://github.com/flutter/flutter/pull/187871), [#190374](https://github.com/flutter/flutter/pull/190374) |
| Windows window size, IME, tooltip fixes | [#187954](https://github.com/flutter/flutter/pull/187954), [#186353](https://github.com/flutter/flutter/pull/186353), [#188476](https://github.com/flutter/flutter/pull/188476) |
| Experimental multi-window tracking | [flutter/flutter#30701](https://github.com/flutter/flutter/issues/30701) |
| Windows popup and sized-to-content windows | [#184516](https://github.com/flutter/flutter/pull/184516), [#186829](https://github.com/flutter/flutter/pull/186829) |
| Dart 3.13 primary constructors and SDK changes | [Dart SDK changelog](https://github.com/dart-lang/sdk/blob/main/CHANGELOG.md) |

The exact local SDK audit range is:

```text
559ffa3f75e7402d65a8def9c28389a9b2e6fe42..4cf24164269a5ebf0c16a028a00727d0e77bbb05
```

# How to start a future implementation thread

1. Start with the P0 — Certify the behavior inherited from Flutter 3.47 brief;
   Gate 0 is completed and its automated baseline is green.
2. Re-check the live `YuuKwn/TwinePlayer` remote, `main`, `origin/main`, HEAD,
   and working-tree status before editing. Do not assume this 2026-08-13
   snapshot is still current.
3. Keep work in `flutter_app` and the explicitly named docs/tests. Do not modify
   the legacy Electron app.
4. Use one implementation worker for tightly coupled Flutter/Dart/C++ files.
5. Preserve unrelated user changes and avoid opportunistic dependency or
   platform-template upgrades.
6. Run the focused checks first, then the proportionate full Flutter, vendored
   WebView, DOM/Node, build, packaging, hash, and smoke gates named in the
   selected brief.
7. Report automated evidence, manual evidence, and outstanding physical/GPU/
   accessibility gates separately.
8. Do not push or open a pull request unless the new thread explicitly asks for
   it.
