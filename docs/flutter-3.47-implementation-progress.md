# Flutter 3.47 implementation progress

**Updated:** 2026-08-25
**Current source base:** 5810af400ade1d84d5ff803f92b20d94aa45cbe6
**Current lane:** P0 DXGI/WebView D3D11 adapter alignment
**Status:** implementation and automated evidence complete; review and manual gates remain open.

## Completed

- **Gate 0 / PR #2:** complete. The merged Flutter 3.47/Forui semantics
  compatibility fix is preserved at
  236194855836844cb9537263864fa80d0b858cc4.
- **PR #3:** squash-merged to YuuKwn `main` at
  5810af400ade1d84d5ff803f92b20d94aa45cbe6. Final CI run `32878550377`
  retains the same pre-existing Electron line-209 outside-viewport failure;
  it does not cover or invalidate this Flutter-native change.
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

## GitHub delivery check

PR #3 final check run 32878550377 is **not green** because the out-of-scope legacy
Electron smoke test “selects a fixture game and supports library search and
sort” times out when getByRole('button', { name: /Library/ }) resolves the
Back to Library button outside the viewport at
test/electron-integration.js:209. The exact signature matches merged Flutter
PR #2 check run 31730990711, so this is verified pre-existing and unrelated to
the Flutter-native implementation. Electron remains out of scope and unfixed;
all Flutter P0 evidence remains passed.

## Next dependency

**P1 — Add the running build identity to settings and diagnostics.** The P0
DXGI adapter alignment implementation is complete and awaiting parent review;
resume with the build-identity brief below. Use Flutter's exact renderer
adapter contract for future native diagnostics and keep runtime GPU evidence
separate from source/build evidence.

## Remaining items in document order

1. P1 — Running build identity in settings and diagnostics.
2. P1 — Debug-only focus visualization.
3. P1/P2 — Stronger semantics regression contracts.
4. P2 optional — Windows flavors for standard and lab artifacts.
5. N1 — Complete stylus and pen support end to end.
6. N2 — Detachable console/native auxiliary windows/multiple story windows:
   **DO NOT SHIP** while Flutter 3.47 windowing remains experimental/internal.
7. N3 — Separately identifiable certification release track.

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
~~~

Require origin to be https://github.com/YuuKwn/TwinePlayer.git, require HEAD
to equal origin/main before new work, and verify gh auth status reports
YuuKwn. Resume with the P1 build-identity brief and reread its research
section before editing. Keep legacy Electron source and generated artifacts
out of scope.

## Explicit manual-gate boundary

Automated green results do not certify physical GPU/adapter behavior, WebView2
story content or texture correctness, visual text/antialiasing, keyboard,
screen-reader, focus, touch, mouse, wheel, pen, IME, DPI/display,
multi-monitor, real SugarCube saves, or the four-client matrix. Every
unperformed cell remains **NOT CERTIFIED** until attributable manual evidence
names the device, driver, WebView2 runtime, build hash, and exercised scenario.
