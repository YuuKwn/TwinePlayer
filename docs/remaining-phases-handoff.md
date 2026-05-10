# TwinePlayer Remaining Phases Handoff

This document is a completion handoff for the implementation plan that brought TwinePlayer to its current release-ready state.

Current branch state at documentation update time:
- `main` has Phase 0 through Phase 7 merged.
- Latest commit at the time this was updated: `70531aa Expand main process test coverage`.
- No planned implementation phases remain in this handoff.
- The working style that produced the phases: implement the phase slice, run checks, code-review the diff, provide a focused test plan, update documentation, then merge only after approval.

## Current Project Snapshot

TwinePlayer is now a modular Electron app with:
- A local game library backed by safe `localStorage` helpers.
- Game metadata extraction from Twine story data, document titles, and filename fallback.
- Search, sort, missing-file detection, and relink support.
- A hardened preload and main-process IPC boundary.
- Async local save operations with filename validation, atomic writes, stale temp cleanup, and save/load/delete UI feedback.
- Extracted game renderer modules under `src/game/` and extracted CSS.
- A developer console with autocomplete, saved per-game commands, overlay/side layouts, and a visible execution-scope warning.
- Optional Illustrator support for Ollama, OpenAI-compatible local text servers, and ComfyUI image generation.
- Illustrator settings normalization, persisted renderer settings, bounded HTTP handling, cancel/timeout behavior, local image copies, and metadata sidecars.
- Automated syntax checks, Node tests, and Windows CI.
- Electron Builder targets for Windows installer, Windows unpacked portable output, and Linux tarball output.

## Already Done

### Phase 0: Baseline Stabilization

Done:
- Added `npm test` and `npm run check`.
- Added Node test coverage around path/save utility behavior.
- Resolved dependency metadata drift for `electron-builder`.
- Added `src/main/file-utils.js`.

### Phase 1: Critical Bugfixes

Done:
- Fixed save fallback naming/call mismatch.
- Fixed Illustrator IPC response shape mismatch.
- Fixed Illustrator output directory return-field mismatch.
- Added safe file URL conversion.
- Added save filename/path traversal validation.
- Added tests for path/file utility behavior.

### Phase 2: Security Hardening

Done:
- Added CSP meta tags to `index.html` and `game.html`.
- Added preload-side argument validation.
- Added main-process IPC validation and normalized error handling.
- Hardened save byte coercion.
- Restricted `postMessage` handling to messages from the loaded iframe.
- Added payload caps for message-based save/scene bridge.
- Changed Illustrator image polling to derive output directory from `gamePath` in the main process instead of trusting renderer-supplied directories.
- Added visible Developer Console scope warning.

Known remaining security caveats:
- `game.html` no longer needs `script-src 'unsafe-inline'` after Phase 3 renderer extraction.
- `game.html` no longer needs `style-src 'unsafe-inline'`; TwinePlayer-owned game UI styles live in `src/game/game.css`.
- The game iframe still uses `allow-scripts allow-same-origin`; this is currently required for save hooks, scene capture, and dev console access.
- Real isolation needs a larger renderer architecture change.

### Phase 3: Main-Process Modularization Slice

Done:
- `main.js` now handles app lifecycle/window creation and delegates IPC registration.
- Added:
  - `src/main/ipc-handlers.js`
  - `src/main/save-service.js`
  - `src/main/illustrator-service.js`
  - `src/main/validation.js`
- Added:
  - `test/run-tests.js`
  - `test/save-service.test.js`
  - `test/validation.test.js`
- `npm run check` now checks all new main-process modules.

### Phase 3 Continued: Renderer Modularization

Goal: reduce the risk and maintenance cost of `game.html`, currently the largest complexity hotspot.

Done:
- Extracted large inline CSS from `game.html` into `src/game/game.css`.
- Extracted inline game runtime JavaScript into deterministic classic script files under `src/game/`.
- Added:
  - `src/game/player.js`
  - `src/game/twine-bridge.js`
  - `src/game/dev-console.js`
  - `src/game/save-engine.js`
  - `src/game/save-modal.js`
  - `src/game/illustrator-ui.js`
  - `src/game/bootstrap.js`
- Kept behavior stable by preserving classic script ordering and moving iframe bootstrap to the final script.
- Removed `script-src 'unsafe-inline'` from `game.html` CSP.
- Added syntax checks for all extracted renderer scripts to `npm run check`.

Notes:
- Phase 4 added `src/storage-utils.js`; storage parsing is now hardened for the library and console command stores.
- Manual GUI smoke testing is still recommended after checkout because the automated check only covers syntax and Node tests.

Focused test plan:
- Start app with `npm start`.
- Load a game with spaces in the file path.
- Use top bar Save, Load, Delete.
- Trigger in-game Save to Disk and Load from Disk if the game exposes native buttons.
- Run a console command like `SugarCube?.State?.variables` or a harmless expression.
- Toggle console overlay/side mode.
- Toggle pinned top bar.
- Open Illustrator with local AI services offline; verify graceful fallback.

### Phase 4: Reliability Improvements

Done:
- Added `src/storage-utils.js` with safe JSON parsing, storage read/write helpers, and one-time corrupt-value backup keys.
- Hardened library history and saved console command parsing so corrupt `localStorage` values fall back safely instead of breaking startup.
- Converted `src/main/save-service.js` filesystem operations to async `fs.promises`.
- Made save writes atomic by writing to a same-directory temp file and renaming into place after successful write.
- Added opportunistic stale temp save cleanup.
- Added a main/preload `file:exists` bridge and renderer checks so missing library items show a clear missing state instead of silently navigating to a broken player.
- Added missing-file handling in `game.html` bootstrap for direct player loads.
- Added renderer-side save filename validation with immediate feedback while keeping main-process validation authoritative.
- Improved save/load failure behavior so failed operations keep the modal open and log the failure.
- Added tests for storage fallback/backup behavior, async save service behavior, atomic temp cleanup, and file existence checks.

Notes:
- The library now offers the existing remove action for missing entries; a richer relink flow remains a good Phase 5 UI task.
- Illustrator offline/error states already surface through the Illustrator UI and remain part of the deeper Phase 6 cleanup for configuration, cancellation, and HTTP behavior.
- Manual GUI smoke testing is still recommended after checkout because the automated check covers syntax and Node-level reliability behavior.

Focused test plan:
- Manually corrupt `twine_player_history` and `twine_player_console_commands` in localStorage and reload app/game.
- Save over an existing slot and verify the final `.save` remains readable.
- Create a stale `.tmp-` save file in a saves directory, save again, and verify stale temp cleanup.
- Load a library item whose game file has been moved/deleted and verify the missing state appears.
- Try invalid save names such as `../bad`, `con`, and blank input and confirm immediate UI feedback plus main-process rejection.

### Phase 5: UI and UX Improvements

Done:
- Removed user-controlled markup interpolation from library cards and save slots.
- Replaced save modal save-slot rendering with DOM construction and `textContent` for filenames, dates, and sizes.
- Added library search by title/path.
- Added library sorting by last played, title, and path.
- Added missing-file scanning for library entries on startup.
- Added a missing-game relink action that opens the existing Twine file picker, updates the library entry, and launches the relinked game.
- Added main-process game metadata extraction from `<tw-storydata name>` and `<title>`, with filename fallback.
- Added preload/IPC metadata access and tests for metadata parsing.
- Added Escape close, focus trap, and focus restoration for the saves modal.
- Added Escape close, focus trap, and focus restoration for the Illustrator modal.
- Added accessible labels/titles for modal close buttons and dynamic save/delete/remove controls.

Notes:
- A broader settings surface was not introduced in this slice because Illustrator defaults/configuration belong to Phase 6 and top-bar/console preferences already have direct controls.
- Remaining inline SVG/button markup in static HTML is not user-controlled. Save and library user data now render through DOM APIs.
- Manual GUI smoke testing is still recommended because keyboard focus and Electron dialog behavior are best verified in the app.

Focused test plan:
- Load games with special characters in filename, `<title>`, and `tw-storydata name`.
- Confirm library cards and save slots render text safely.
- Add enough history entries to test search and each sort mode.
- Move/delete a library game file and confirm the missing state appears after startup.
- Use Relink on a missing game and verify the entry updates and launches.
- Open/close saves and Illustrator modals by keyboard.
- Tab through each modal and verify focus wraps inside, then returns to the triggering button after close.

### Phase 6: Illustrator Feature Cleanup

Done:
- Added `src/main/illustrator-config.js` with normalized Illustrator defaults and validation.
- Added configurable text backend support for Ollama and OpenAI-compatible local servers.
- Kept Ollama support through `/api/tags` and `/api/generate`.
- Added OpenAI-compatible support through `/v1/models` and `/v1/chat/completions`, intended for llama.cpp, MLX/oMLX, and similar local servers.
- Added configurable text endpoint, text model, ComfyUI endpoint, checkpoint, dimensions, sampler, scheduler, steps, CFG, and negative prompt in the Illustrator panel.
- Persisted Illustrator settings in `localStorage`.
- Added image-generation cancel behavior and a max polling timeout.
- Hardened Illustrator HTTP handling for status codes, invalid JSON, response-size caps, image content type, and expected response shapes.
- Made ComfyUI output prefixes deterministic (`twineplayer_<timestamp>`).
- Saved local image metadata sidecars next to generated images.
- Updated docs to reflect configurable backends, llama.cpp/MLX/oMLX usage, and actual workflow defaults.
- Added tests for Illustrator config normalization.

Notes:
- The OpenAI-compatible backend expects a server that implements `/v1/models` and `/v1/chat/completions`; use the endpoint including `/v1`, such as `http://192.168.1.20:8080/v1`.
- Canceling stops TwinePlayer polling. It does not cancel the ComfyUI job already queued on the ComfyUI server.
- Manual GUI smoke testing is still recommended because service availability, LAN endpoint reachability, and ComfyUI queues are environment-dependent.

Focused test plan:
- Open Illustrator with both services offline and verify clean fallback messages.
- Use Ollama at `http://localhost:11434` with `llama3.2`.
- Use llama.cpp or MLX/oMLX through OpenAI-compatible mode with a `/v1` endpoint on the Mac.
- Open with only text backend online.
- Open with only ComfyUI online.
- Generate prompt with configured model.
- Queue image with configured checkpoint and generation settings.
- Cancel generation and confirm polling stops.
- Confirm timeout behavior by setting an unavailable or slow ComfyUI endpoint.
- Confirm image and `.json` metadata sidecar appear in `<game>_illustrations`.

### Phase 7: Documentation, Packaging, and Release

Done:
- Rewrote `README.md` and `docs/documentation.md` as clean ASCII documentation.
- Updated architecture docs for the current modular main/renderer structure.
- Added troubleshooting docs for save detection, unsupported engines, Ollama, OpenAI-compatible llama.cpp/MLX-oMLX servers, ComfyUI, and iframe/CSP limits.
- Added `.github/workflows/check.yml` for `npm ci` and `npm run check` on Windows.
- Added `npm run build:win:portable` using Electron Builder's `dir` target.
- Added Windows `dir` target alongside `nsis`.
- Improved `.gitignore` for logs, coverage, generated saves/illustrations, temporary files, local env files, and packaged artifacts.
- Added a release checklist to docs.
- Built a Windows unpacked portable folder as `dist/Twine Player 29`.

### Post-Phase 7: Main-Process Test Coverage

Done:
- Added `test/ipc-handlers.test.js` coverage for expected IPC registration, file dialog results, safe file URL errors, file existence checks, game metadata, save read/write/delete round trips, invalid save filenames, and Illustrator default config responses.
- Added `test/illustrator-service.test.js` coverage for Ollama model listing, OpenAI-compatible model listing, OpenAI-compatible prompt generation, malformed response handling, ComfyUI checkpoint listing, ComfyUI workflow construction, pending image polling, image download/local copy behavior, metadata sidecar writes, and non-image response rejection.
- Updated `test/run-tests.js` to include the expanded test files.

Focused test plan:
- Run `npm run check`.
- Confirm all Node test files load through `test/run-tests.js`.
- Confirm Illustrator service tests use local temporary HTTP servers and do not require real Ollama, OpenAI-compatible, or ComfyUI services.

Acceptance criteria:
- Fresh clone instructions are documented.
- CI can catch syntax/test failures.
- Docs match current architecture and user-facing behavior.
- Release process is repeatable.
- Windows unpacked portable artifact exists as `dist/Twine Player 29`.

Focused test plan:
- Clone fresh and run `npm install`.
- Run `npm run check`.
- Run `npm start`.
- Build Windows portable target.
- Build Linux target if environment supports it.
- Smoke test packaged app.

## Remaining Work

No planned phases remain in this handoff.

## Suggested Continuation Strategy

Recommended next slice:
1. Perform manual smoke testing on the packaged Windows app.
2. Test real Illustrator endpoints for Ollama, OpenAI-compatible llama.cpp/MLX-oMLX, and ComfyUI.
3. If smoke testing passes, tag a release and upload artifacts.

## Standing Rules for Future Chats

- Keep changes scoped to the current phase slice.
- Preserve existing behavior unless the phase explicitly changes it.
- Run `npm run check` before reporting completion.
- Provide:
  - what changed,
  - code-review concerns,
  - verification results,
  - focused test plan.
- Do not merge/push until the user says to merge it in.
- When merging:
  - stage only relevant files,
  - commit with a clear message,
  - push `main` to `origin/main`,
  - confirm clean status.
