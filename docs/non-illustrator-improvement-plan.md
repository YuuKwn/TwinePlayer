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
9. Complete an accessibility and reduced-motion pass.

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

**Status:** Completed on 2026-05-10.

Progress notes:
- Added Playwright-based Electron integration coverage via `npm run test:integration`.
- Added isolated E2E startup mode that uses a temporary Electron `userData` directory and disables hardware acceleration for test runs.
- Added fixture Twine-like HTML files for library metadata and fake SugarCube save/load coverage.
- Integration flows cover empty library rendering, mocked fixture selection, library search/sort, missing-file removal, game iframe loading, back-to-library navigation, save modal keyboard close, save create/overwrite/load/delete, and developer-console layout/pinned-bar toggles.
- CI runs the integration command after `npm run check`; environments that cannot start Electron due to a GPU-process failure are reported as an infrastructure skip.

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

**Status:** Completed on 2026-05-10.

Progress notes:
- Added a browser-compatible shared library-history helper for filename title fallback and entry normalization.
- Startup now normalizes `localStorage` history, removes malformed entries, fills missing titles/dates, deduplicates by path, and writes cleaned history back only when normalization changed the data.
- Normalization drops unrecognized entry fields so persisted library history has a stable shape.
- Focused unit tests cover malformed entries, title fallback, deterministic deduplication, valid-history preservation, dropped-field cleanup, and memory-storage writeback behavior.

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

**Status:** Completed on 2026-05-10.

Progress notes:
- Added a browser/Node shared `game-player-helpers` module for save metadata formatting, save display names, stable console fallback hashing, autocomplete parsing, and autocomplete filtering.
- Game save modal and developer console now consume extracted helpers while preserving classic script loading behavior.
- Console command history normalization and mutation now happen through tested helpers, so malformed persisted console-history data cannot break saved-command rendering.
- Focused Node tests cover save metadata helpers, autocomplete parsing/filtering, stable hashing, and console command store normalization/add/remove behavior.
- `npm run check` passes. `npm run test:integration` exits successfully with the documented Electron GPU-process infrastructure skip in this environment.

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

**Status:** Completed on 2026-05-10.

Progress notes:
- Save filename normalization now lives in a browser/Node shared helper and is consumed by both main-process file utilities and the save modal.
- Renderer feedback and main-process enforcement now agree on blank names, dot-only names, traversal/path-like input, absolute paths, null bytes, reserved Windows device names, invalid Windows filename characters, extension appending, and `.save` extension case handling.
- Code review tightened the trust boundary by rejecting `:` and other Windows-invalid filename characters before path resolution, avoiding alternate-data-stream style edge cases on Windows.
- Focused unit tests cover the shared helper directly and the main-process `file-utils` export path.

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

**Status:** Completed on 2026-05-10.

Progress notes:
- Save overwrite and delete now use an in-app confirmation dialog inside the save modal instead of blocking native `confirm()` prompts.
- Confirmation dialogs support mouse and keyboard accept/cancel flows, Escape cancellation, focus trapping, and focus return to the initiating save slot or delete button.
- A native `confirm()` fallback remains for unexpected markup failures, while missing confirmation markup no longer breaks save-modal initialization.
- Integration coverage verifies overwrite and delete cancel/accept paths, Escape behavior, parent modal preservation, and focus restoration.

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

**Status:** Completed on 2026-05-10.

Progress notes:
- Tightened `game.html` CSP by removing `style-src 'unsafe-inline'` now that TwinePlayer-owned game UI styles live in `src/game/game.css`.
- Replaced clear-only `innerHTML = ''` usage in game scripts with `textContent = ''` so DOM updates avoid unnecessary HTML parsing.
- Added focused HTML policy tests to prevent reintroducing inline styles, `unsafe-inline` in `game.html`, or clear-only `innerHTML` in game scripts.

### Problem

Some comments contained mojibake artifacts, and `game.html` previously allowed inline styles through `style-src 'unsafe-inline'`.

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

**Status:** Completed on 2026-05-10.

Progress notes:
- Electron Builder uses an explicit runtime allowlist with generated saves, illustrations, logs, tests, docs, local build output, and debug folders excluded from packaged releases.
- Release artifacts use a stable `TwinePlayer-${version}-${os}-${arch}.${ext}` name that avoids spaces from the display product name.
- Package metadata now includes a non-empty author field.
- Added `npm run package:smoke` for the Windows unpacked target and wired it into CI after the Electron integration smoke test.
- Added automated package configuration tests so allowlist, exclusions, artifact naming, and smoke script coverage are harder to regress.
- No project-owned icon assets are currently available, so icon metadata remains unset rather than referencing missing files.

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

## Slice 9: Accessibility and Reduced-Motion Pass

**Status:** Completed on 2026-05-10.

Progress notes:
- Library search, history cards, missing-entry relink/remove actions, save slots, save filename input, save delete buttons, top-bar controls, and developer-console icon buttons now expose stronger keyboard and screen-reader affordances.
- Library cards and save slots are keyboard-operable with Enter/Space, and hover-only remove/delete controls are revealed on focus as well as hover.
- Focus-visible styling now covers library controls, cards, modal controls, save slots, console controls, and icon-only buttons without changing the app's visual structure.
- Added reduced-motion handling for library, modal, console, and save-slot transitions while preserving hidden-panel transforms.
- Added automated accessibility policy tests for required labels, dialog relationships, keyboard affordances, focus reveal behavior, and reduced-motion safeguards.

### Problem

The app had several accessible patterns, but keyboard and screen-reader behavior was uneven. Library cards were clickable but not keyboard-operable, some icon-only controls depended on `title`, hover-only destructive controls were hard to reach without a mouse, and animation did not honor reduced-motion preferences.

Relevant files:
- `index.html`
- `game.html`
- `src/index.css`
- `src/game/game.css`
- `src/renderer.js`
- `src/game/save-modal.js`
- `src/game/dev-console.js`
- `test/accessibility.test.js`

### Proposed Implementation

- Add visible `:focus-visible` styles across library, save modal, top-bar, and developer-console controls.
- Give icon-only controls and dynamic action buttons clear `aria-label`s.
- Ensure save modal and confirmation dialogs expose correct labels and descriptions.
- Make library cards and save slots keyboard-operable.
- Reveal hover-only remove/delete controls on `:focus-within`.
- Add `prefers-reduced-motion` support without breaking hidden overlay/console transforms.

### Acceptance Criteria

- All primary controls are reachable without a mouse.
- Reduced-motion users do not get unnecessary animations.
- Modal labels and descriptions are exposed to assistive technology.
- Automated tests cover the key accessibility contracts.

## Slice 10: Library Page CSP Hardening

**Status:** Completed on 2026-05-10.

Progress notes:
- Removed the remaining `style-src 'unsafe-inline'` allowance from `index.html`.
- Replaced renderer-applied library card `animationDelay` inline styles with bounded CSS classes that preserve the existing staggered entrance animation.
- Expanded HTML policy tests so both app pages reject inline style allowances, style tags, and style attributes.
- Added regression coverage to keep library card animation delays in CSS rather than DOM style mutation.
- Code review found the change narrows the library page trust boundary without adding new renderer input handling, IPC exposure, or file-system access.

### Problem

The game page CSP had already been tightened, but the library page still allowed inline styles. The only TwinePlayer-owned dependency on inline styling was the library card stagger animation, which was set through the renderer with `card.style.animationDelay`.

Relevant files:
- `index.html`
- `src/renderer.js`
- `src/index.css`
- `test/html-policy.test.js`

### Implementation

- Move library card animation delays into explicit CSS classes.
- Assign a bounded delay class from the renderer based on display order.
- Remove `'unsafe-inline'` from the library page `style-src` directive.
- Extend HTML policy tests to cover both `index.html` and `game.html`.

### Acceptance Criteria

- The library page no longer allows inline styles in its CSP.
- Library card animation behavior remains bounded and CSS-owned.
- Automated policy tests prevent the inline-style allowance from being reintroduced.

## Standing Verification

For each implementation slice:

1. Keep changes scoped to that slice.
2. Add or update automated tests where practical.
3. Run `npm run check`.
4. For renderer/UI slices, perform a manual smoke test or add an integration test.
5. Update this document or the main documentation if behavior changes.

## Current Best First Slice

Continue by choosing a new Slice 11 candidate. Slices 1-10 are complete; the next best improvement should be scoped from current product priorities.
