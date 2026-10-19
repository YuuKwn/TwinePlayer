# Investigation: save/load without game or browser dialogs

2026-10-18. Investigation only; production save/load code and UX Preview 4 binaries are unchanged. Native executable tested: build `20261018-ux4`, binary source `e6977ff28791cccc62751209913c73ba9364e6fe`.

## Finding

For the genuine SugarCube versions tested, successful disk save/load does not require displaying SugarCube's Saves window or an operating-system file picker. The app can invoke the engine's own disk routines, capture exported bytes, and supply selected bytes as an in-memory `File`. The engine retains responsibility for decoding, validation, migration, callbacks, state restoration and rendering. Native UI retains responsibility for choosing names/files and writing bytes safely.

Removing all visible game errors and supporting arbitrary custom save menus need additional handling. Hiding the Saves window alone is insufficient.

## Why the current dialog appears

`MainWindow.Saves.cs:Load_Click` calls `TwineBridge.PrepareNativeLoadAsync` before opening the app's manager. The shared bridge's `__twinePlayerPrepareNativeLoad` calls `SugarCube.UI.saves()`, looks for a disk-load button and clicks it. The overridden `HTMLInputElement.prototype.click` stores that input and posts `load-request`. The host shows its own picker, then injects the chosen bytes into that input and dispatches `change`.

Thus the current integration obtains an engine-owned file-input handler by constructing/opening its Saves UI. That handler is useful, but the visible window is an implementation consequence. The native adapter also prepares the legacy SugarCube 1 saves UI/import input. Current game-dialog closing is delayed and primarily happens after submitting a file; canceling the native manager does not explicitly dispose that prepared flow.

Save already attempts direct Base64/serialization APIs before disk export. Native SugarCube 1 capture calls `SaveSystem.exportSave` directly. Blob/anchor interception transports disk-export bytes back to the app. Unexpected WebView2 downloads are already canceled by `TwinePlayerService.DownloadStarting`; canceled downloads do not show the browser download-save dialog, per Microsoft's contract.

## Experiments performed

Reproducible local scripts and JSON: `artifacts/save-dialog-research/probe.js`, `report.json`, `file-picker-probe.js`, `file-picker-report.json`. These ignored research artifacts are local evidence, not new product dependencies or distributed private games.

The engine experiment uses genuine offline runtimes, current shared bridge plus the native CompletionAdapter, and isolated headless Chromium contexts. It commits a test variable through an engine passage transition, captures a disk save, opens a fresh context and imports the bytes without calling UI preparation or setting a pending input. All four restored the expected variable. The direct flows recorded zero filechooser, download and JavaScript dialog events, zero observed `#ui-dialog` visible frames, and no pending load input. The visibility observer specifically covers `#ui-dialog`; it is not universal screen capture or full legacy UI certification.

| Runtime | Capture boundary | Direct load boundary | Result |
| --- | --- | --- | --- |
| SugarCube 1.0.35 authored fixture | `SugarCube.SaveSystem.exportSave()` | `SugarCube.SaveSystem.importSave({target: input})` | Fresh-context state restored |
| SugarCube 2.18.0 official example | `SugarCube.Save.export(...)` | `SugarCube.Save.import({target: input})` | Fresh-context state restored |
| SugarCube 2.36.1, Accidental Mind Alpha 3.4 | `SugarCube.Save.export(...)` | `SugarCube.Save.import({target: input})` | Fresh-context state restored |
| SugarCube 2.37.3 authored fixture | `SugarCube.Save.disk.save(...)` | `await SugarCube.Save.disk.load({target: input}); Engine.show()` | Fresh-context state restored |

The input is detached from the document, populated using `File`/`DataTransfer`; no file picker is invoked. Modern runtime came from the official offline 2.37.3 ZIP, SHA-256 `DA00A8C15EC4E88A9E231A3FF6C516C57055F84231BB999F869ED34ADE353DAB`. Local authored modern story is in the research directory. Original private game was read only.

Separately, the existing native WebView2 save suite passed on UX Preview 4 using a disposable Accidental Mind copy: `artifacts/native-save-smoke-7a5ab34c5abd4b2ab3c1df8bf31ed9f0`. It verified capture, direct cross-process restore of passage/variable, the existing native-dialog route and Flutter SaveService compatibility. The direct restore mode does not call UI preparation. This corroborates direct loading on the real host; the four-version replacement experiment itself is Chromium evidence, not a shipped WebView2 implementation.

## Issues the experiments exposed

1. **Older export completion is misclassified.** On 2.18.0, the current bridge reports `SugarCube native export returned no save data` even though the interceptor posts valid save bytes. `Save.export` starts a download and returns no payload; it must be treated as an asynchronous capture, with completion/error correlation and timeout. The genuine engine's disk export/import roundtrip succeeds.
2. **Disk callbacks differ from serialized callbacks.** The probe observed `serialize` for current capture on 2.36.1/2.37.3, versus `disk` when invoking actual disk export. Preserve the disk routine when replacing a game's disk UI; don't assume a serialized save invokes identical game logic merely because both produce Base64 text.
3. **Legacy import returns before restoration finishes.** SC1/older SC2 import routines return no Promise. Calling the function or dispatching `change` is not proof of successful load. Current native status already distinguishes submission from completion for the file-input path. A replacement must correlate actual completion/failure; `Save.onLoad` alone is insufficient because some engines invoke it before final validation/restoration.
4. **Invalid saves can still produce game UI.** Injected invalid data preserved the previously restored variable. On 2.18.0 and 2.36.1 it opened a SugarCube error dialog. On 2.37.3 `disk.load` rejected its Promise without opening a dialog. SC1 returned without a Promise; its failure presentation needs dedicated handling rather than inference from the absence of `#ui-dialog`. A fully native experience must forward legacy engine errors into native UI while suppressing only the operation's corresponding game alert.
5. **Current file-picker interception has gaps.** With the actual shared bridge, scripted `input.click()` produced one host load request and no filechooser event. Trusted label activation and `input.showPicker()` each produced a filechooser event and no host load request. Overriding `.click()` alone does not cover those browser entry points.

## Recommended implementation

1. Open the app's Load manager directly. Do not prepare SugarCube's UI during normal host loading; cancel then needs no engine input/dialog cleanup.
2. Select engine adapters by capabilities: modern SC2 `disk.save/load`, older SC2 `export/import`, SC1 `SaveSystem.exportSave/importSave`. Feed the selected bytes to a detached file input. Keep Base64/serialize as deliberate compatibility alternatives when appropriate, respecting engine permissions and callback types.
3. Preserve engine-produced `.save` bytes and the current native SaveService's size limits, confirmation, durable writes and atomic replacement. Do not rebuild saves by dumping `State.variables` or calling raw state-unmarshal methods, which bypass engine save contracts. Do not use `Save.base64.import`/`Save.disk.import` as single-save fallbacks: modern import APIs restore browser-save bundles, with different and potentially destructive semantics.
4. Add operation-correlated capture/restore completion, cancellation/navigation cleanup and legacy error forwarding. Avoid trying a series of different save APIs after an engine permission/callback failure. Route the failure into native UI; never report success because an asynchronous handler merely started.
5. Route standard in-game save/load actions to the native manager as well. Cover relevant file-input/label activation and `showPicker` paths; scope interception to supported save operations so unrelated uploads and game prompts keep their semantics. Known HTML action IDs can be intercepted in capture phase; generic CSS hiding cannot redirect a handler.
6. For a more comprehensive file-picker fallback, investigate WebView2's existing CDP interface with `Page.setInterceptFileChooserDialog`/`Page.fileChooserOpened`. Chromium documents that interception suppresses the native picker and emits an event. The app already calls CDP through the in-process WebView2 API; no remote debugging port is necessary. Actual WebView2 capability, backend-node availability, frames and lifecycle still require validation before adoption. The command is not marked experimental in the current protocol; some event details are.
7. If an export cannot be captured in script, WebView2's stable `DownloadStarting` supports `Handled=true` plus a controlled result path for a silent staging download. Import that result through native validation/SaveService and clean up. Merely setting Handled suppresses UI but does not stop a download or apply atomic-write guarantees. Keep unsolicited downloads canceled. `SaveAsUIShowing` is a separate document/page Save As facility, not the primary solution for SugarCube Blob `.save` exports.

A scoped invisible engine-dialog fallback is possible for custom games that only expose a UI-bound handler. Install suppression before opening it and restore/close in every success, failure and cancellation path. It is less reliable than direct engine boundaries: focus trapping, body scroll locking, delayed callbacks, accessibility and error dialogs still need handling. Never globally hide all dialogs or disable all alerts.

Before shipping: verify actual WebView2 valid/invalid/foreign saves, save/load callbacks, engine-denied saves, native cancel, custom prompts, replay/recreation races, same-passage loads, legacy completion and zero unwanted dialogs. Include frame/label/showPicker cases if the generic picker fallback is adopted. Use one focused marked build for that implementation; this investigation does not alter the existing build.

## Primary references

- [SugarCube 2 Save API](https://www.motoslave.net/sugarcube/2/docs/#save-api): modern Base64/disk APIs, legacy serialization, browser bundles.
- [SugarCube 2.36.1 save source](https://github.com/tmedwards/sugarcube-2/blob/v2.36.1/src/save.js): FileReader import, serialization, engine callbacks, error UI and state restoration.
- [SugarCube current save source](https://github.com/tmedwards/sugarcube-2/blob/master/src/save.js) and [UI source](https://github.com/tmedwards/sugarcube-2/blob/master/src/ui.js): separate engine loading and visible UI wrappers.
- [SugarCube 1 save source](https://github.com/tmedwards/sugarcube-1/blob/master/src/savesystem.js): export/import boundary; exact 1.0.35 behavior also tested using the genuine local fixture.
- [Microsoft DownloadStarting event arguments](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2downloadstartingeventargs?view=webview2-1.0.4258.31): cancellation, handled UI and output-path semantics.
- [Chromium Page protocol source](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Page.pdl): file chooser interception and event schema.

No application source was changed, no original game/save was written, and no new product package was built for this investigation.
