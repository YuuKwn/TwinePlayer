# Migration feature parity

**1.0 primary product:** The user promoted the completed native migration to the official TwinePlayer release. Save/Load/Console toggle their panels in both sidebar profiles/states; Home confirms before leaving. Existing parity features, engine payloads and data locations are retained. See RELEASE-1.0.md and EXECUTION.md for current release behavior and evidence; the phase notes below are historical.

> **Historical migration status — 2026-10-17:** Mandatory migration phases 0–9 are implemented and accepted on the user's Windows setup with Phase 9 TEST r4 (`20261017-r4`, binary source `12c9779`). The user reported "All good, tested here" and then explicitly waived the additional accessibility/display, VoidLink/Quest and separate clean-Windows validation: "No need foe all thoae". Those scenarios remain unverified and are no longer completion gates for this delivery. Earlier pending/blocker entries below are historical evidence, superseded by this acceptance and waiver. Optional Phase 10, signing, installers and publishing remain outside this delivery. The accepted immutable r4 package keeps its TEST label and is not rebuilt or renamed.

Baseline: local `main` c450a3c, Flutter 1.0.0+10, audited 2026-10-16. Local main and cached origin/main diverge by 7 commits each; no pull/reset was performed over existing WPF edits. The local Flutter source is the oracle for this migration. Phase 1 establishes the first native playback implementation; manual acceptance remains pending as reported in PHASE-1.md.

| ID | Flutter capability | Native destination | Phase | Native status |
|---|---|---|---|---|
| F01 | HTML/HTM import | App picker, Core file validation | 1 | Implemented; picker manual check pending |
| F02 | WebView2 playback | App runtime service (Player extraction in Phase 2) | 1 | Native six-story smoke passed; media/input manual pending |
| F03 | Relative assets, host mapping | Runtime resource/origin policy | 1 | Native CSS/JS/image and isolation passed; media manual pending |
| F04 | SugarCube 1/2 capture/restore | Player bridge | 2 | Genuine v1/Accidental Mind v2 pass; actual Flutter-produced v2 payload and older user export also restore with unchanged input hashes |
| F05 | Native SugarCube disk integration | Player bridge, App dialogs | 2 / UX5 | Direct engine disk routines with native UI; first/repeated save/load, cancel, error/retry, picker and standard menu routing tested on four genuine versions; physical interaction unverified |
| F06 | Sidecar save CRUD | Player Saves, App dialogs | 2 | File integrity/concurrency tests pass; manual confirmation checks pending |
| F07 | Library/history | Persistence SQLite, App library | 3 | Implemented; native registration/reopen pass |
| F08 | Twine/SugarCube metadata | Core extraction | 3 | Implemented; bounded reads and priority/entity tests pass |
| F09 | Title/path search and sorting | App library | 3 | Native search/title sort tests pass; recent/path available |
| F10 | Missing files/relink | Core identity, Persistence, App | 3 | ID/origin/settings tests pass; picker manual pending |
| F11 | Context actions/remove undo | App library, SQLite operations | 3 | Implemented; remove/undo tests pass, shell/clipboard manual pending |
| F12 | Story undo/back | App engine-first bridge call | 4 | Implemented; native SugarCube undo tested |
| F13 | Fullscreen F11/Escape/restoration | AppWindow adapter | 4 | Presenter cycles pass; r3 fixes browser-focused key routing and Windows-injected F11/Escape passes; physical DPI/monitor checks pending |
| F14 | Compact player toolbar | Native CommandBar | 4 | Implemented with dynamic overflow and More menu |
| F15 | JavaScript console/results/errors | Player execution, App console | 5 | Native execution/error test passed |
| F16 | History/completion/saved commands | Core console, Persistence | 5 | Native completion/reopen tests and key-preservation regressions pass |
| F17 | Overlay/side-by-side console | App console views | 5 | Native layout tests pass; physical visual/focus checks pending |
| F18 | DevTools | Player explicit user command | 5 | Implemented; manual DevTools interaction pending |
| F19 | Image preview/context actions | App preview, Player source policy | 6 | Native click/context/local/blob tests pass; physical input pending |
| F20 | Image zoom/pan/reset/double tap | App image preview | 6 | Native controls tested; physical gestures pending |
| F21 | Per-story zoom/preferences | Persistence StoryPreferences | 6 | Native reflow/pixel-ratio/persistence tests pass |
| F22 | Assistance v2: four engines | Player canonical bridge | 6 | Four actual engine fixtures pass native/DOM lifecycle checks |
| F23 | Enhanced choices/readability | Player bridge, App settings | 6 | Implemented opt-in; unknown/protected DOM and reset checks pass |
| F24 | Auto/Comfortable/Compact | Core profile, App input | 7 | Trusted native browser input switching passes; physical clients pending |
| F25 | Custom Comfortable command bar | Core normalization, App | 7 | Pinning/order/size/reach/collapse/persistence pass; physical usability pending |
| F26 | Optional page controls | Player bridge, App | 7 | Canonical page helper; native scrolling pass |
| F27 | Opt-in private diagnostics | Core bounded recorder, App | 7 | Opt-in/privacy/bounds/contact cancellation pass |
| F28 | Offline Input Lab | App asset, Player fixture mode | 7 | Actual bundled lab/no-history/reload pass; hardware matrix pending |
| F29 | Accessibility/focus | App semantics and focus policy | 1–8 | Native peers/directional dialog focus pass; screen reader/Tab/theme/text physical checks pending |
| F30 | DPI/monitor/lifecycle | AppWindow, Player generation | 1–8 | Actual crash/recovery/reopen/latest-open/fullscreen checks pass; physical display matrix pending |
| F31 | Identity/portable/hash manifest | tools packaging | 9 | Phased portable provenance/hash/distributed smoke implemented; final release checks pending |
| F32 | Opt-in browser data migration | Persistence snapshot, trusted App workspace | 9 | Actual copied-profile LS/IDB/cookies/browser-slot migration and conflicts/retry pass; production profiles and stated unsupported types remain uncertified |
| F33 | Rollback of native saves to Flutter | Unchanged Flutter/game disk import | 9 | Real SC2 host bridge and genuine SC1 game-owned import pass; unchanged Flutter SC1 host Load reports unknown engine |

## Existing evidence and gaps

Flutter has focused tests under `flutter_app/test/` for each capability group. `test/run-flutter-bridge-dom.js` exercises diagnostics and DOM bridge behavior; `test/run-story-assistance-dom.js` exercises offline official fixtures and SugarCube capture fallbacks. These do not certify WinUI, native WebView2 rendering, hardware clients or screen readers.

Fixtures: `test/fixtures/story-assistance-official/` contains actual bundled SugarCube, Harlowe, Chapbook and Snowman runtimes, with source/license/hash provenance in its README. `fake-sugarcube.html` is a test double, not a real legacy SugarCube 1 runtime. A genuine SugarCube 1 fixture and a proven Flutter-created save must be obtained/generated before full compatibility certification. User-supplied Accidental Mind is available locally but must not be committed or redistributed.

Phase 2 closes the runtime-fixture gap with `native_windows/fixtures/sugarcube1/legacy-sugarcube1.html`, compiled from the author's genuine offline 1.0.35 runtime with license and hashes. Compatibility saves are generated by the unchanged Flutter SaveService in disposable test directories; historical GUI-created save provenance remains unverified.

Excluded: Electron AI Illustrator; unshipped pen hardware certification and native multiwindow features. Optional Phase 10 is outside mandatory parity.

Phase 9 r4 retains browser-profile isolation despite WebView2 environment/policy redirects; both ordinary playback and migration are guarded. Actual fresh disposable-profile migration passes after the change. Current evidence also includes an actual unchanged Flutter-runtime capture restored by native, while historical export producer provenance remains unknown. Full manual and clean Evergreen deployment gates remain open.

Post-migration UX Preview 1: native TitleBar/back navigation, responsive layered library, contextual actions, last-played presentation, empty/search recovery, console hierarchy and grouped native settings implemented. See UX-REFRESH.md for documentation references, real runtime/save evidence and the limits of XAML-rendered PNGs. No Flutter, player bridge, browser profile or save-format migration is introduced.

User-requested UX Preview 2 supersedes the horizontal compact/Comfortable bars with a right sidebar. Order, target sizes, optional page commands and Console/More pins remain supported vertically. Alignment maps to top/center/bottom; legacy horizontal reach values are preserved but the sidebar stays right. Sidebar navigation replaces the title-bar app back button. See UX-SIDEBAR.md for tested bounds, scroll/collapse and runtime evidence.

UX Preview 3 adds native access keys with visible-scope collision checks, lighter compact controls, grouped native menus and existing shortcut hints. Settings Apply is primary. Save filename validity and Load/Delete selection gate the dialog actions live; service validation, overwrite/delete confirmations and Cancel behavior remain intact. The right-sidebar layout is retained; see UX-CONVENTIONS.md.

Version 1.1 adds per-game saved-command sidebar shortcuts and vertically scrollable, resizable console lists. The existing Save/Load/Console toggles and Home confirmation are retained. See RELEASE-1.1.md.
