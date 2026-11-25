# TwinePlayer UX overhaul

## Baseline and scope

The baseline is the checked-out WinUI UX Preview 8 (`7016c12`) and its matching portable package. This branch has the private SugarCube save fallback. The 1.2 release integrates this overhaul and the private SugarCube fallback into the public 1.1 line. Existing WPF edits are unrelated. Flutter is a behavioral reference and Electron is historical. App-owned WinUI chrome is the design surface. Each game's HTML and styling remain under the game's control.

The isolated baseline UX smoke passed and produced 32 Windows layout PNGs in `artifacts/native-ux-89448369e87645fa805714f93baafcbf`. The sandboxed attempt rendered the library but could not initialize WebView2. The successful run used the same fixture stories with a fresh data root outside that sandbox. The renderer captures app-owned XAML with a flat theme background. It excludes Mica, WebView2 pixels and native flyouts. The harness also opens a real WebView2 and checks the native menu through UI Automation.

No usage analytics or user testing data was provided for this overhaul. Frequency estimates below reflect how often a journey is likely to occur when using its feature.

## Capability inventory

| Area | Expected outcomes |
| --- | --- |
| Library | Open a local HTML/HTM story, register it after a successful open, search title/path, sort by recent/title/path, play an entry, identify missing files, relink the same identity, copy path, reveal in Explorer, remove the entry and undo removal. |
| Migration | Preview and confirm Flutter library/settings import or browser-data import using the existing snapshots and separate native destination. |
| Player | Play local stories and assets through WebView2, retain browser identity, return to the library, reopen or reload a story, undo story moves, use fullscreen and native keyboard commands. |
| Save/Load | Capture and restore supported SugarCube saves, including the private-engine fallback. Browse, create, overwrite and delete sidecar saves with existing validation and confirmations. Recover and retry after failures. |
| Console | Run JavaScript, browse history, autocomplete, reuse and save commands, run/delete saved commands, manage per-game sidebar shortcuts, open DevTools, and resize panes in overlay and side-by-side layouts. |
| Appearance and input | Apply per-story zoom/readability/choice preferences. Retain Auto, Compact and Comfortable profiles, sidebar layout/order/size, optional page controls, window placement and native theme support. |
| Images and advanced tools | Open image preview and context actions, zoom/pan and copy source. Run offline Input Lab, opt into input diagnostics, clear/copy its report, and confirm story browser-data reset. |

## Audit and priorities

| Priority and frequency | Observation and impact | Planned change and validation | Complexity and risk |
| --- | --- | --- | --- |
| High · routine | The baseline compact sidebar hides all general status text. Open progress, saves, zoom and library actions can provide little or no visible feedback. | Give playback and library actions a common, named status area. Exercise loading, success and error states in compact mode. | Medium · maintain the WebView and console viewport contract. |
| High · routine | Library screenshots show two unlabeled ellipses, a large input above loose rows, and a playful empty-state title with hidden help at short heights. A missing file can be clicked as if playable. | Place Open and Settings near the library heading, distinguish game and app actions, tighten list rows, improve missing-file and empty guidance, and preserve selection and keyboard context. Compare short and wide captures. | Medium · retain pointer activation, sort, focus and the existing handlers. |
| High · occasional | The save dialog uses one line per filename/date/size, the flow shows a blank list when empty, and errors look like help text. A canceled delete sends users back through the same form. | Improve filename hierarchy, empty copy, error announcement, and focus/selection recovery. Verify validation and save outcomes using real engine fixtures. | Medium · preserve every confirmation and write/restore call. |
| Medium · frequent for console users | Console actions appear actionable without a command. Selecting a result without a runnable command can appear to do nothing. The panel can silently switch layouts at narrow widths. | Make selection-dependent actions honest, give empty panes guidance, retain selection when list updates permit, and explain when the width forces overlay. Check both modes and large lists. | Medium · retain command execution, persistence, focus and shortcuts. |
| Medium · occasional | Settings require scrolling and order controls invite dead clicks. Explanatory text and disabled states leave prerequisites implicit. | Label prerequisites at the relevant controls, guard impossible reorder actions, improve focus recovery and add concise apply feedback. Capture both themes at narrow widths. | Low · use existing native controls and preference values. |
| Medium · occasional | Image commands overflow into a horizontal strip. Diagnostics and import steps provide uneven feedback. | Keep image toolbar commands within typical preview widths, announce image and diagnostic outcomes, and make import review scannable. Use existing runtime suites to check these paths. | Low to medium · preserve all input and migration operations. |

This prioritization follows visibility of system status, recognition, error prevention and recovery. WinUI controls and semantic theme resources provide the basis for native focus, contrast and input behavior. Modal focus, visible labels and sizing follow the relevant accessibility principles in WCAG 2.2, with Windows UI Automation used for native validation. Twine's documentation establishes HTML files and story formats as the terminology users already encounter. [NN/g heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Fluent 2](https://fluent2.microsoft.design/) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Twine publishing](https://twinery.org/reference/en/publishing/playing.html)

## Implemented

- **Library.** Labeled Open and Settings actions anchor the library. The empty view explains how to begin, and search and sort appear once there are games to browse. Tighter rows give the title priority over the path, with a warning icon and text for missing files. Search retains selection through a temporary filter, return from playback selects the previous story when visible, and Undo restores the entry and focus. The selected-game file menu remains distinct from the app menu. Playnite's compact desktop listing informed the density choice. [Playnite Desktop Mode](https://github.com/Playnite/Docs/blob/main/docs/manual/gettingStarted/playniteDesktopMode.md)
- **Player.** The title bar identifies the active story. Load progress and action feedback appear in a full-width status area, including with the icon rail. Dismissing playback feedback returns space and focus to the story or console. The standalone native error bar remains available for failures. [Microsoft InfoBar guidance](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/infobar)
- **Save and Load.** The filename and modified time have distinct hierarchy. Empty Load gives a clear next action. The Save dialog focuses the filename and keeps the extension outside the initial selection. Invalid names have visible descriptions and native automation status. Retry messages stay with the form. Existing Save, Load, Delete, Overwrite and Cancel decisions use the same rules.
- **Developer console.** History and saved commands state what belongs in each pane. Actions reflect command selection, and editing a history entry focuses the prompt. The shorter header leaves enough room for both resizable lists in the short-window check. The side-by-side fallback explains how to regain its layout.
- **Settings and tools.** Interaction settings explain when Comfortable controls apply and only enable feasible reorder actions. Appearance explains story-format prerequisites. Image preview keeps zoom and copy together, with a focusable pan surface. Diagnostics confirms copy and clear in place. Flutter and browser import previews make destination, conflicts and empty states clearer.

These decisions retain native tab traversal and the existing access keys for sidebar commands. A new library Settings access key and live status exposure improve discoverability. Theme-aware resources keep the same system color model across surfaces. [Windows keyboard design](https://learn.microsoft.com/en-us/windows/apps/design/input/keyboard-interactions) · [Microsoft live-region sample](https://learn.microsoft.com/en-us/accessibility-tools-docs/items/uwpxaml/text_livesetting)

## Before and after

- At the same wide capture size, the library row pitch decreased from approximately 85 to 69 pixels, about 19%. Settings went from two pointer activations through More to one visible action. Search and play use the existing operations.
- On a 640 × 480 test window, first-use help remains visible. An expanded sidebar and the side-by-side console preference still leave two usable scrolling lists in the overlay fallback. The smoke assertion requires each list viewport to stay at least 32 pixels high.
- The 197-entry fixture exercised a title over 220 characters and a path search. Filtering and laying out the result took about 34 ms in one local observation, including the test's dispatcher polling.
- The same WebView2 idle fixture rendered after 1,014 ms before and 961 ms after with a fresh profile, and after 998 ms before and 964 ms after on relaunch. Both builds reported the same 1,104 × 779 initial story viewport at DPR 1. Each condition has one observation. These timings establish a local comparison and are insufficient to establish a general speed gain or human task completion times.

## Verification and limits

- The pinned SDK locked restore and Release build succeeded. All 60 native unit tests passed. No application framework, external dependency, domain algorithm, save format or storage schema changed.
- The WinUI UX smoke drove the actual app and validated open and search states, remove/undo, focus restoration, access-key collisions, sidebar modes, native menus through UI Automation, long content, resizable console lists and shortcuts, and save validation/cancel behavior. The final run includes 36 light, dark, wide and short-window layout captures.
- Native playback passed five fixtures covering SugarCube, Harlowe, Chapbook, Snowman and local assets. The smoke also covered persistence, fullscreen transitions, native peers and modal focus, offline Input Lab, diagnostics and image preview. Both native SugarCube save-dialog suites passed. The genuine-engine DOM suite passed in installed Edge with SugarCube 1, SugarCube 2 and a SugarCube 2 fixture with its public namespace hidden.
- The browser migration regression passed with a newly seeded disposable legacy profile. It retained native conflicts, preserved the source, transferred localStorage, typed IndexedDB data and a secure cookie, and restored SugarCube progress. This exercised the migration operations outside the interactive import form.
- The physical foreground keyboard run stopped before sending a key because the test window did not own foreground input. The computer-use helper also mapped the disposable window to the installed executable and rejected the window ownership check. Native automation peers, modal traversal and focus restoration are covered independently. Narrator speech, magnification, OS High Contrast, real touch/pen and streaming client operation require a dedicated interactive session.
- One intermediate run saw an unexpected WebView2 browser-process exit (0xC0000005) while interacting with the console. The complete UX smoke subsequently passed. The cause is unconfirmed.
- The app-owned XAML capture excludes WebView2, Mica and native flyout pixels. Game-rendered content, private mods beyond the regression fixtures, and production workload performance require separate testing. This evidence describes the preview. The 1.2 release retains the official modeless Save and Load panels and the Home confirmation.

## Evidence in the source checkout

| Evidence | Artifact directory |
| --- | --- |
| Baseline XAML renders | artifacts/native-ux-89448369e87645fa805714f93baafcbf |
| Updated XAML renders and library timing | artifacts/native-ux-af12668235e044d0b0d6b1117701c23a |
| Native playback and accessibility checks | artifacts/native-smoke-8c47a222bb994786bd4560b512e9a00a |
| Native SugarCube save UI | artifacts/native-save-ui-b28ef083931c42cab3c77886a1dde492 |
| Save DOM regression in Edge | artifacts/native-save-dom-1f3008d6-0331-4abe-a7fa-edbce40c4213 |
| Browser migration | artifacts/native-browser-migration-e5a6dd9c5ba744ada983ede9cb77be49 |
| Idle benchmark baseline and updated build | artifacts/native-benchmark-b694614d-94d6-4f96-844b-71683d1c289c · artifacts/native-benchmark-caede9f6-1556-4b98-886a-345ef2b68823 |
