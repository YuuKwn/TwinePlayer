# Flutter 3.47 implementation progress

**Updated:** 2026-08-25
**Current source base:** 236194855836844cb9537263864fa80d0b858cc4
**Current lane:** P0 inherited-behavior certification evidence
**Status:** automated evidence complete; manual gates remain open.

## Completed

- **Gate 0 / PR #2:** complete. The merged Flutter 3.47/Forui semantics
  compatibility fix is preserved at
  236194855836844cb9537263864fa80d0b858cc4.
- **P0 inherited-behavior certification:** evidence captured in
  [flutter-3.47-certification-report.md](flutter-3.47-certification-report.md).
  Flutter 3.47 pub get, analyzer, 67/67 Flutter tests, 7/7 vendored
  WebView tests, Windows release build, 26-file package/hash/ZIP verification,
  three smoke cycles, and all four named root Node/DOM suites passed.
- Runtime telemetry observed Impeller OpenGLESSDF in one packaged run. The
  packaged process loaded the Flutter and WebView bridge DLLs and closed with
  exit code 0. This is not GPU, WebView-content, visual, or hardware
  certification.
- No application source defect was reproduced and no application source was
  changed. The initial Node filesystem EPERM and Node 21 engine warnings are
  preserved as environment notes in the report.

## GitHub delivery check

PR #3 check run 32878086307 is **not green** because the out-of-scope legacy
Electron smoke test “selects a fixture game and supports library search and
sort” times out when getByRole('button', { name: /Library/ }) resolves the
Back to Library button outside the viewport at
test/electron-integration.js:209. The exact signature matches merged Flutter
PR #2 check run 31730990711, so this is verified pre-existing and unrelated to
the three documentation files. Electron remains out of scope and unfixed; all
Flutter P0 evidence remains passed.

## Next dependency

**P0 — Align the vendored WebView D3D11 device with Flutter's DXGI adapter.**
Keep this as a separate implementation/read-only boundary. Use Flutter's
actual PluginRegistrarWindows graphics adapter contract; do not infer adapter
identity from source or build configuration.

## Remaining items in document order

1. P0 — DXGI/WebView D3D11 adapter alignment.
2. P1 — Running build identity in settings and diagnostics.
3. P1 — Debug-only focus visualization.
4. P1/P2 — Stronger semantics regression contracts.
5. P2 optional — Windows flavors for standard and lab artifacts.
6. N1 — Complete stylus and pen support end to end.
7. N2 — Detachable console/native auxiliary windows/multiple story windows:
   **DO NOT SHIP** while Flutter 3.47 windowing remains experimental/internal.
8. N3 — Separately identifiable certification release track.

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
YuuKwn. Resume with the DXGI adapter alignment brief and reread the P0
research section before editing. Keep legacy Electron source and generated
artifacts out of scope.

## Explicit manual-gate boundary

Automated green results do not certify physical GPU/adapter behavior, WebView2
story content or texture correctness, visual text/antialiasing, keyboard,
screen-reader, focus, touch, mouse, wheel, pen, IME, DPI/display,
multi-monitor, real SugarCube saves, or the four-client matrix. Every
unperformed cell remains **NOT CERTIFIED** until attributable manual evidence
names the device, driver, WebView2 runtime, build hash, and exercised scenario.
