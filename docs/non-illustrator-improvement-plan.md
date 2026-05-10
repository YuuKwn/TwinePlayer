# TwinePlayer Non-Illustrator Improvement Plan

This document captures the next practical improvement opportunities for TwinePlayer, excluding the AI Illustrator feature area. It is intended as a future implementation guide, not a record of completed work.

## Goals

- Tighten trust boundaries around local files and save operations.
- Increase automated coverage for user-visible renderer behavior.
- Reduce browser-global coupling in the game player modules.
- Keep the app simple, maintainable, and release-ready.
- Preserve existing Twine playback, save/load, library, and developer-console behavior unless a slice explicitly changes it.

## Recommended Order

1. Harden save IPC path authorization.
2. Add renderer/Electron integration tests for core flows.
3. Normalize and dedupe library history.
4. Extract testable game-player helpers.
5. Share save filename validation between renderer and main process.
6. Replace blocking confirm dialogs.
7. Clean encoding artifacts and remove remaining nonessential inline styles.
8. Harden packaging configuration.

## Slice 1: Save IPC Path Authorization

**Status:** Completed on 2026-05-10.

Progress notes:
- Main process now tracks authorized game paths and checks authorization before `save:list`, `save:write`, `save:read`, and `save:delete`.
- Game selection accepts only readable `.html` and `.htm` files, and save operations re-check that the selected path still resolves to the same readable file.
- Rejected save operations return normalized `{ success: false, error }` responses.
- Focused IPC tests cover selected-path save flows, unknown paths, missing paths, and non-HTML/direct authorization rejection.

### Problem

Save operations currently validate save filenames well, but they still trust the renderer-provided `gamePath`. Main-process handlers call save operations using that path, and saves are written to sidecar folders next to it.

Relevant files:
- `src/main/ipc-handlers.js`
- `src/main/save-service.js`
- `src/main/file-utils.js`
- `preload.js`
- `test/ipc-handlers.test.js`
- `test/save-service.test.js`

### Proposed Implementation

- Track game paths selected through `dialog:openFile` in the main process.
- Accept only `.html` and `.htm` game files for selection.
- Before `save:list`, `save:write`, `save:read`, and `save:delete`, verify that the game path is authorized and still points to a readable file.
- Consider authorizing direct player loads only through a deliberate main-process API if needed later.
- Return normalized `{ success: false, error }` responses for rejected save operations.
- Keep filename validation unchanged and authoritative in the main process.

### Tests

- Selected game paths can list/write/read/delete saves.
- Unknown paths are rejected for every save operation.
- Missing selected paths are rejected or return safe empty/error responses consistently.
- Non-HTML selections are rejected if the dialog result is mocked to return one.

### Acceptance Criteria

- Renderer-controlled arbitrary paths cannot cause save sidecar writes.
- Existing library load and save/load flows still work.
- `npm run check` passes.

## Slice 2: Renderer and Electron Integration Tests

### Problem

Node tests cover main-process utilities well, but most user-visible behavior lives in browser globals and has little automated coverage.

Relevant files:
- `src/renderer.js`
- `src/game/*.js`
- `index.html`
- `game.html`
- `package.json`
- `.github/workflows/check.yml`

### Proposed Implementation

- Add a Playwright-based Electron test setup.
- Add small Twine-like fixture HTML files under `test/fixtures/`.
- Cover the app from a user perspective rather than testing implementation details.
- Keep integration tests focused and stable; avoid requiring real AI services.

### Candidate Test Flows

- Launch app and verify empty library state.
- Mock/select a fixture game and verify it appears in the library.
- Verify library search and sort.
- Verify missing-file state and remove/relink behavior.
- Open a fixture game and verify title, iframe load, and back-to-library navigation.
- Open/close save modal by keyboard.
- Create, overwrite, load, and delete a save using a fixture game where possible.
- Toggle developer console overlay/side mode and pinned bar state.

### Acceptance Criteria

- CI runs the integration tests or has a separate documented command for them.
- The tests do not depend on local user files or external services.
- Failures point to real user-facing regressions.

## Slice 3: Library History Normalization

### Problem

Library history is read from `localStorage` as an array, but item shape is not fully normalized. Duplicate paths, missing fields, invalid dates, and malformed entries can produce awkward behavior.

Relevant files:
- `src/renderer.js`
- `src/storage-utils.js`
- `test/storage-utils.test.js`

### Proposed Implementation

- Add a browser-compatible library-history helper.
- Validate each entry:
  - `path` must be a non-empty string.
  - `title` must be a non-empty string or fall back to filename formatting.
  - `lastPlayed` must be a valid date or fall back to current time.
- Deduplicate by path, keeping the most recent `lastPlayed`.
- Persist normalized data back to `localStorage` only when changed.
- Add unit tests using memory storage.

### Acceptance Criteria

- Corrupt or malformed history cannot break startup.
- Duplicate library cards are removed deterministically.
- Existing valid history is preserved.

## Slice 4: Extract Testable Game-Player Helpers

### Problem

The extracted `src/game/*.js` scripts still rely on shared browser globals and load order. That is workable, but it makes targeted testing and future changes harder.

Relevant files:
- `src/game/player.js`
- `src/game/save-engine.js`
- `src/game/save-modal.js`
- `src/game/dev-console.js`
- `src/game/twine-bridge.js`
- `src/game/bootstrap.js`

### Proposed Implementation

- Extract pure or near-pure helpers first, without changing script loading behavior.
- Good first candidates:
  - Save filename validation.
  - Save metadata formatting.
  - Library/game title fallback formatting.
  - Console command storage helpers.
  - Autocomplete property filtering.
- Use factory functions for DOM-heavy modules where useful, passing dependencies explicitly.
- Keep classic script order until tests make a larger module-system change safe.

### Acceptance Criteria

- Helper behavior has Node tests.
- Browser behavior remains unchanged.
- The game scripts become easier to reason about in smaller units.

## Slice 5: Shared Save Filename Validation

### Problem

Save filename validation exists in both the renderer modal and main-process file utilities. Main-process validation is authoritative, but the renderer-side message can drift from it.

Relevant files:
- `src/main/file-utils.js`
- `src/game/save-modal.js`
- `test/file-utils.test.js`

### Proposed Implementation

- Create a shared validation helper that can run in Node and the browser.
- Keep main-process path resolution in `src/main/file-utils.js`.
- Use the shared helper from the save modal for immediate feedback.
- Expand tests for reserved Windows names, blank names, traversal, absolute paths, null bytes, extension handling, and case behavior.

### Acceptance Criteria

- Renderer and main process agree on accepted/rejected save filenames.
- User-facing validation messages remain clear.

## Slice 6: Replace Blocking Confirm Dialogs

### Problem

Save overwrite and delete currently use native `confirm()` dialogs. They work, but they interrupt flow, are not styled with the app, and are awkward to integration test.

Relevant file:
- `src/game/save-modal.js`

### Proposed Implementation

- Add a small reusable confirmation modal within the save modal surface.
- Support keyboard focus trapping and Escape close.
- Use clear destructive/action labels for delete and overwrite.
- Keep the old behavior only as a fallback if the custom confirm cannot render.

### Acceptance Criteria

- Delete and overwrite can be completed with mouse or keyboard.
- Focus returns to the initiating control.
- Integration tests can confirm both cancel and accept paths.

## Slice 7: Encoding and Inline Style Cleanup

### Problem

Some comments contain mojibake artifacts, and `game.html` still has inline styles that require `style-src 'unsafe-inline'`.

Relevant files:
- `game.html`
- `src/game/save-engine.js`
- `src/game/save-modal.js`
- `src/game/game.css`

### Proposed Implementation

- Replace mojibake comments with plain ASCII comments.
- Move nonessential inline styles from `game.html` into `src/game/game.css`.
- Replace static inline SVG button HTML created through `innerHTML` with DOM construction where practical.
- Revisit the CSP after inline styles are removed.

### Acceptance Criteria

- `game.html` no longer needs inline styles for TwinePlayer-owned UI.
- CSP can be tightened if no app-owned inline style remains.
- Comments render cleanly in plain text editors.

## Slice 8: Packaging Hardening

### Problem

Electron Builder configuration is currently minimal. That is acceptable for early packaging, but release builds benefit from explicit files, predictable artifact names, app metadata, and package smoke checks.

Relevant files:
- `package.json`
- `.gitignore`
- `.github/workflows/check.yml`

### Proposed Implementation

- Add an explicit Electron Builder `files` allowlist.
- Add stable artifact naming.
- Add app icon metadata when icons are available.
- Confirm generated saves, illustrations, logs, test fixtures, and local-only files are excluded from packaged releases.
- Consider a CI build smoke job for the Windows unpacked target.

### Acceptance Criteria

- Packaged app includes only needed runtime files.
- Artifact names are predictable.
- A packaging regression is easier to catch before release.

## Standing Verification

For each implementation slice:

1. Keep changes scoped to that slice.
2. Add or update automated tests where practical.
3. Run `npm run check`.
4. For renderer/UI slices, perform a manual smoke test or add an integration test.
5. Update this document or the main documentation if behavior changes.

## Current Best First Slice

Start with **Slice 1: Save IPC Path Authorization**. It has the best security-to-effort ratio, fits the current architecture, and can be verified with focused Node tests before taking on broader renderer test infrastructure.
