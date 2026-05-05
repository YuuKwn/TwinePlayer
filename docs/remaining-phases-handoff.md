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
- `src/game/storage.js` was intentionally deferred to Phase 4 because hardening localStorage parsing changes behavior and should be tested as a reliability slice.
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

## Remaining Work

## Phase 4: Reliability Improvements

Goal: reduce corrupted state, partial writes, and main-process blocking.

Tasks:

1. Harden localStorage parsing.
   - Current history and console command stores should not break the app when localStorage contains invalid JSON.
   - Add `safeJsonParse` and default fallback behavior.
   - Consider a one-time backup key for corrupted values.

2. Make save writes atomic.
   - Write to a temp file in the save directory.
   - Rename into place after successful write.
   - Clean up stale temp files opportunistically.

3. Move save service filesystem operations to async APIs.
   - Replace sync `fs` calls in `src/main/save-service.js` with `fs.promises`.
   - Update IPC handlers to await service calls.
   - Keep tests deterministic.

4. Improve missing game handling.
   - If a library item points to a missing file, show a clear missing state.
   - Provide remove/relink options later if UI scope allows.

5. Improve save name validation in renderer before IPC.
   - Keep main-process validation authoritative.
   - Add immediate UI feedback for invalid filenames.

6. Add better failure states.
   - Save failed.
   - Load failed.
   - Unsupported Twine engine.
   - Illustrator service unreachable.

Acceptance criteria:
- Corrupt localStorage does not break startup.
- Save writes cannot leave partial final files.
- Save service tests cover atomic write behavior.
- Missing game files do not navigate to a broken player silently.

Focused test plan:
- Manually corrupt `twine_player_history` in localStorage and reload app.
- Save over an existing slot.
- Kill/restart app after saving and verify slot remains readable.
- Load a missing game from library and verify graceful handling.
- Try invalid save names and confirm UI/main-process behavior.

## Phase 5: UI and UX Improvements

Goal: make the app easier and safer to use without changing its identity.

Tasks:

1. Replace risky `innerHTML` usage where user-controlled data enters markup.
   - Library card title/path in `src/renderer.js`.
   - Save slot filename/date in `game.html` or extracted save modal module.
   - Prefer `document.createElement` and `textContent`.

2. Improve library management.
   - Search by title/path.
   - Sort by last played/title.
   - Show missing-file state.

3. Extract better game metadata.
   - Current title extraction mostly uses filename.
   - Add main-process metadata extraction from `<title>` and `tw-storydata name`.

4. Improve modal accessibility.
   - Escape closes modals.
   - Focus trap inside active modal.
   - Restore focus after close.
   - Accessible labels for icon buttons.

5. Add settings surface.
   - Top bar pinned mode.
   - Console layout.
   - Default Illustrator model/checkpoint.
   - Save directory mode, if supported later.

Acceptance criteria:
- User-controlled title/path/save names are not injected through `innerHTML`.
- Library remains usable with many games.
- Keyboard-only modal operation is reasonable.

Focused test plan:
- Load games with special characters in filename/title.
- Confirm library cards render text safely.
- Add enough history entries to test search/sort.
- Open/close modals by keyboard.
- Verify focus does not get lost behind modals.

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
1. Start Phase 4 with hardened localStorage parsing in the extracted renderer modules.
2. Add focused tests or a small testable helper for `safeJsonParse` behavior.
3. Then move save writes in `src/main/save-service.js` toward atomic writes.
4. Run `npm run check` and perform the focused manual smoke test.
5. Review the diff and provide a focused test plan before merge approval.

Avoid combining Phase 4 reliability work with broader UI rewrites. The renderer is now split enough that each reliability improvement should land as a small, reviewable behavior change.

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
