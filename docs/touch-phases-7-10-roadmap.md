# TwinePlayer touch phases 7–10 roadmap

This roadmap records the smallest evidence-gated follow-up slices after the
Phase 0–6 Flutter Windows baseline. Phases 8–10 below describe the software
implementation and automated evidence now present in this source state; they
do not claim that any hardware run has passed.

## Phase 7 — certification and software gates

Phase 7 is a release-candidate certification pass. The software gates are:

- the Flutter Windows release builds from a clean, reproducible source tree;
- focused and full Flutter tests, vendored `webview_windows` tests, and the
  real Playwright bridge DOM test all pass;
- the bundled Input Lab is reachable only after an explicit Settings/library
  action and confirmation, never enters library history, has no network
  dependency, and keeps diagnostics disabled by default;
- copied diagnostics contain only allowlisted metadata. An optional
  user-entered scenario label is sanitized, bounded to 64 characters,
  session-only, and omitted when empty; coordinates, story text, paths, keys,
  timestamps, and telemetry are never recorded;
- clearing the event list preserves the session label so repeated runs remain
  attributable; clearing/editing the label is an explicit field action;
- enhanced choices remain namespaced, opt-in, mutation-aware, idempotent, and
  exactly teardown-able. Existing story-owned classes/attributes and layout
  are preserved;
- package folder, ZIP inventory, file counts, SHA-256 values, and bounded
  smoke launch are recorded. No visual or hardware certification is implied
  by a successful software gate.

The Input Lab is the canonical manual fixture. It covers app chrome versus
story-WebView diagnostics, touch/multitouch/cancel, mouse primary/secondary
click and wheel, links/choices, forms, inline-image preview/context, dynamic
added/removed choices, long and nested scrolling, `contenteditable`,
canvas/SVG/draggable exclusion surfaces, focus restoration, fullscreen, and
both interaction profiles.

## Phase 8 — Story Assistance v2 (opt-in) — implemented

The Flutter candidate now ships an engine-aware, opt-in Story Assistance v2
store and bridge. Official offline Cookbook fixtures cover SugarCube, Harlowe,
Chapbook, and Snowman, and the DOM runner exercises the supported lifecycle.
The implementation provides:

- text scale, line spacing, paragraph spacing, optional readable line length,
  and target spacing are independent controls;
- default is **Off**. Reset and teardown restore the exact pre-assistance DOM
  state (styles, observers, and only markers owned by TwinePlayer);
- no DOM replacement; no colors, fonts, or animations without a separate
  explicit opt-in and fixture coverage;
- canvas, SVG, `contenteditable`, draggable regions, and game-owned widths are
  preserved by default. Story layout widths are never globally constrained;
- each engine fixture proves dynamic passage updates, removal, navigation,
  reload, and teardown. A failed engine detection leaves the story untouched.

The automated DOM evidence is recorded by
`npm run test:flutter-story-assistance`; physical story and pointer behavior
remain in the NOT CERTIFIED matrix below.

## Phase 9 — configurable command bar — implemented

The candidate includes a persistent, versioned command-bar preference store and
settings UI for alignment, movable command order, Small/Standard/Large target
size, reach mode, and opt-in Page Up/Page Down commands. Collapse remains at
the far left; Console is pinned immediately before More, and More remains the
rightmost command. Compact mode, keyboard/mouse operation, focus restore, and
existing shortcuts remain intact. Reorder, migration, reset, semantics, target
sizes, and Tab traversal are covered by Flutter tests. Edge swipes and gestures
over the story WebView are not intercepted or claimed.

## Phase 10 — accessibility, resilience, and delivery — implemented software gates

Semantic labels and deterministic focus traversal are present for chrome,
settings, command bar, and console overlays. The native runner re-queries the
current monitor for fullscreen display/DPI changes, falls back to normal
`WM_DPICHANGED` handling when needed, and clamps the restored window rectangle
to the nearest work area. Player route back/disposal explicitly restores the
windowed state. A bounded Flutter PlayerScreen open→F11→Back→reopen soak uses
mocked host/WebView channels; native multi-monitor and physical WebView2
behavior still require manual Windows evidence.

Version `1.0.0+10` has a portable-first packaging script that creates a folder,
ZIP, and SHA-256 manifest after release-build validation. Installer evaluation
is documented separately and is not part of this implementation.

Signing, auto-update, telemetry, and publishing are separate authorizations;
this roadmap does not authorize them.

## Four-client certification matrix

Every cell is **NOT CERTIFIED** until a physical run is recorded with build
hash, WebView2 runtime, display/DPI, profile, and checklist evidence.

| Client / mode | Compact | Comfortable | Diagnostics off | Diagnostics on | Fullscreen/reopen | Status |
| --- | --- | --- | --- | --- | --- | --- |
| VoidLink native touch | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED |
| VoidLink simulated mouse | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED |
| Quest Virtual Desktop controller ray | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED |
| Quest hand tracking | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED | NOT CERTIFIED |

### Repeatable per-mode run sheet

Start every run with the same preflight: record the artifact/EXE SHA-256,
Windows and WebView2 Runtime versions, display topology and DPI, selected
Compact or Comfortable profile, and a fresh diagnostics report with no
scenario label. Launch the bundled Input Lab only after its disclosure. A
mode remains **NOT CERTIFIED** unless every required action and its evidence
is recorded.

- **VoidLink native touch — NOT CERTIFIED.** With diagnostics off, activate
  chrome and story controls, perform one-finger and simultaneous two-finger
  contacts, cancel one contact by leaving the surface, and confirm the other
  contact remains independent. Repeat with diagnostics on and a sanitized
  `VoidLink native touch` label; the copied report may contain only allowlisted
  counts/kinds/categories. Exercise Choice one/two, dynamic add/remove,
  nested scrolling, form focus, contenteditable, image preview and context,
  canvas/SVG/draggable exclusions, fullscreen enter/exit, and close/reopen.
  Evidence: report, screen recording or operator notes, and no crash/stuck
  contact after reopen.
- **VoidLink simulated mouse — NOT CERTIFIED.** With diagnostics off, use
  primary click, right-click, wheel, links/choices, and keyboard focus. With
  diagnostics on, label `VoidLink simulated mouse` and verify mouse metadata
  never reports touch contacts; repeat image/context, dynamic nodes, both
  profiles, fullscreen, and reopen. Evidence must show the right-click and
  wheel paths remain mouse events and no edge swipe is captured.
- **Quest Virtual Desktop controller ray — NOT CERTIFIED.** Run through the
  Virtual Desktop ray with diagnostics off, then on with label `Quest VD
  controller ray`. Activate chrome and story targets, long-scroll, submit a
  form, open/close image preview and diagnostics, switch Compact/Comfortable,
  enter/exit fullscreen, and reopen. Record delivered pointer kinds and
  focus restoration; do not infer touch certification from a simulated ray.
- **Quest hand tracking — NOT CERTIFIED.** With diagnostics off, perform
  pinch/tap equivalents on chrome and story, two-hand overlap if available,
  cancellation/lost-contact recovery, and focus/fullscreen reopen. Repeat
  diagnostics on with label `Quest hand tracking`, dynamic add/remove,
  contenteditable, canvas/SVG/draggable exclusion, image preview/context,
  right-click/wheel equivalents if exposed, and both profiles. Evidence must
  include the runtime's actual pointer delivery and a clean report; hand
  tracking remains NOT CERTIFIED if the runtime does not expose deterministic
  contact/cancel semantics.

### Hardware-only gates

- Verify native touch contact ordering, cancellation/lost-contact recovery,
  simultaneous contacts, and mouse coexistence on VoidLink hardware.
- Verify simulated mouse never becomes a touch contact and right-click/wheel
  remain mouse events.
- Verify controller-ray and hand-tracking pointer kinds delivered through
  Virtual Desktop, including focus and fullscreen recovery.
- Verify stylus/inverted-stylus hardware before enabling true WebView2
  `PT_PEN` forwarding. The current channel deliberately avoids guessing
  `PenMask`, `PenPressure`, `PenFlags`, tilt, or hover semantics; until a
  primary-API-backed implementation and native/channel tests exist, these
  inputs remain on the existing mouse path and are **NOT CERTIFIED** as pen.

The conservative pen gate is grounded in the primary platform contracts:
Microsoft's [`ICoreWebView2CompositionController::SendPointerInput`](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2compositioncontroller#sendpointerinput)
accepts a fully populated pointer-info object;
[`ICoreWebView2PointerInfo`](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2pointerinfo)
defines `PointerKind` (`PT_TOUCH` and `PT_PEN`) plus distinct touch/pen masks
and pressure fields; Flutter's
[`PointerDeviceKind`](https://api.flutter.dev/flutter/dart-ui/PointerDeviceKind.html)
distinguishes touch, stylus, inverted stylus, mouse, and trackpad. Until the
native channel carries and tests those pen fields end-to-end, guessing them
would be less safe than preserving the existing mouse behavior.

## Maintained checklist

For each release candidate attach the exact source state (commit plus diff or
archive), Flutter/WebView2
versions, analyzer/test/build commands, bridge runtime output, artifact
hashes/file counts, smoke-launch evidence, and the four-client matrix above.
Record failures separately from pre-existing warnings. Do not mark a client
certified from automated tests alone.

## Software evidence recorded for the Phase 8–10 candidate

The Flutter candidate now includes the following offline/software gates. These
are implementation and automation results, not hardware certification:

- Story Assistance v2 uses a versioned per-game store, official offline
  Cookbook fixtures for SugarCube, Harlowe, Chapbook, and Snowman, conservative
  engine detection, exclusion surfaces, dynamic add/remove handling, one style
  node, one observer, teardown, reset, reload, and page-scroll bridge checks.
- Command-bar preferences use a versioned app-level store/controller. The
  movable middle region honors alignment/reach/order and Small/Standard/Large
  button targets; Collapse stays far-left, Console is pinned immediately
  before More, and More stays far-right. Page Up/Page Down are opt-in and call
  the story bridge directly; edge gestures and global shortcuts are not
  intercepted.
- The native runner re-queries the current monitor for fullscreen display/DPI
  changes and clamps the saved window rectangle to the nearest work area when
  fullscreen exits. Route back explicitly leaves fullscreen before popping.
- Version `1.0.0+10` is packaged by
  `flutter_app/tool/package_windows_release.ps1` into a portable folder, ZIP,
  and SHA-256 manifest. The script never targets the Phase 0–7 artifact.

Run `npm run test:flutter-story-assistance` and
`npm run test:windows-resilience` from the repository root alongside the full
Flutter gates. Use `docs/installer-evaluation.md` for any separately approved
installer assessment.
