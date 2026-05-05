# TwinePlayer Remaining Phases Handoff

This document is a continuation handoff for future implementation work.

Current branch state at handoff time:
- `main` has Phase 0, Phase 1, Phase 2, and all Phase 3 modularization work merged.
- Latest merged commit at the time this was updated: `Modularize game renderer`.
- The working style that produced the last phases: implement the phase slice, run checks, code-review the diff, provide a focused test plan, update this handoff, then merge only after approval.

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
- `game.html` still needs `style-src 'unsafe-inline'` because some markup still uses inline `style` attributes.
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

## Remaining Work

## Phase 6: Illustrator Feature Cleanup

Goal: make the experimental AI feature configurable and predictable.

Tasks:

1. Move hardcoded Illustrator settings into configuration.
   - Ollama URL.
   - ComfyUI URL.
   - Default Ollama model.
   - Default checkpoint.
   - Image dimensions.
   - sampler/steps/CFG/negative prompt.

2. Add cancellation and timeout behavior.
   - Current polling can keep going until service response changes.
   - Add max polling duration.
   - Add cancel button.

3. Improve HTTP client behavior.
   - Check HTTP status codes before parsing.
   - Validate expected JSON shape.
   - Cap downloaded image size.
   - Validate image content type where practical.

4. Make output naming deterministic.
   - Keep local sidecar directory authoritative.
   - Normalize generated filenames.
   - Consider storing metadata next to generated image.

5. Align docs with actual code.
   - Update model/checkpoint defaults.
   - Update sampler/steps values.
   - Document service setup and failure modes.

Acceptance criteria:
- Offline Ollama/ComfyUI states are clean and unsurprising.
- User can configure endpoints/defaults.
- Image generation can be canceled or times out.
- Docs match actual behavior.

Focused test plan:
- Open Illustrator with both services offline.
- Open with only Ollama online.
- Open with only ComfyUI online.
- Generate prompt with configured model.
- Queue image with configured checkpoint.
- Cancel generation.
- Confirm files appear in `<game>_illustrations`.

## Phase 7: Documentation, Packaging, and Release

Goal: make the project easy to build, test, and release.

Tasks:

1. Fix README/docs encoding issues if still present.
2. Update architecture docs after Phase 3 renderer extraction.
3. Add troubleshooting docs:
   - Save not detected.
   - Unsupported Twine engine.
   - Ollama unavailable.
   - ComfyUI unavailable.
   - CSP or iframe limitations.

4. Add CI.
   - Install.
   - `npm run check`.
   - Optional build smoke.

5. Validate packaging.
   - Windows build.
   - Linux build.
   - Artifact smoke run.

6. Improve `.gitignore`.
   - Logs.
   - coverage.
   - temporary save fixtures.
   - local settings.
   - packaged artifacts.

7. Consider release checklist.
   - Version bump.
   - changelog.
   - release notes.
   - artifact upload.

Acceptance criteria:
- Fresh clone instructions work.
- CI can catch syntax/test failures.
- Docs match current architecture and user-facing behavior.
- Release process is repeatable.

Focused test plan:
- Clone fresh and run `npm install`.
- Run `npm run check`.
- Run `npm start`.
- Build Windows target.
- Build Linux target if environment supports it.
- Smoke test packaged app.

## Suggested Continuation Strategy

Recommended next slice:
1. Start Phase 6 by moving hardcoded Illustrator defaults/endpoints into configuration.
2. Add cancellation and timeout behavior for ComfyUI polling.
3. Harden Illustrator HTTP status, JSON-shape, and image response handling.
4. Run `npm run check` and perform the focused manual smoke test.
5. Review the diff and provide a focused test plan before merge approval.

Avoid combining Phase 6 Illustrator cleanup with packaging/release work. The Illustrator feature is experimental enough that configuration, cancellation, and HTTP hardening should stay reviewable.

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
