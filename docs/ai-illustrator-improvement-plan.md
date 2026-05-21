# TwinePlayer AI Illustrator Improvement Plan

This plan is for future Codex implementation work on the AI Illustrator feature. The goal is to evolve the current experimental modal into a trustworthy, useful workflow for adapting Twine narrative passages into visual novel or comic-style illustrations.

## Product Intent

The Illustrator should help a player or author turn the current Twine scene into consistent, locally generated artwork without interrupting play. It should preserve user control, work with local services first, keep generated files organized beside the game, and make later regeneration or editing possible.

The target experience:
- Capture the current passage and enough recent context to understand the scene.
- Turn that context into a clean image prompt that respects a game-level visual style.
- Generate one or more images through ComfyUI.
- Save each result with rich metadata and show it in an in-game illustration panel or gallery.
- Make iteration easy: regenerate, vary seed, edit prompt, compare outputs, and reuse scene/style context.

## Current State

### Existing Capabilities

- `game.html` includes a Scene Illustrator modal opened from the player top bar.
- `src/game/illustrator-ui.js` captures visible passage text from the iframe when the modal opens, or accepts manual text.
- Prompt generation supports:
  - Ollama via `/api/tags` and `/api/generate`.
  - OpenAI-compatible local servers via `/v1/models` and `/v1/chat/completions`.
- Image generation supports a fixed ComfyUI txt2img workflow:
  - checkpoint loader
  - positive and negative CLIP prompts
  - empty latent image
  - KSampler
  - VAE decode
  - SaveImage
- Main-process service code validates endpoint schemes, response status, JSON shape, response sizes, image content types, model names, prompts, and prompt IDs.
- Generated images are copied to `<game>_illustrations/` with a small `.json` metadata sidecar.
- The renderer stores Illustrator settings in `localStorage`.
- Node tests cover config normalization, model listing, prompt generation, workflow construction, image polling, local image copy, and non-image rejection.

### Main Gaps

- Illustrator filesystem writes are not tied to the existing authorized game path boundary. `ensureOutputDir()` and `pollImage()` accept renderer-provided `gamePath` values and can create/write sidecar folders for arbitrary paths.
- Scene capture is one-shot and shallow. It captures visible text only when the modal opens, with no passage identity, recent context, speaker handling, story variables, or automatic updates.
- The prompt pipeline is generic. It has no style bible, character consistency layer, visual continuity memory, panel/comic composition controls, or per-game adaptation presets.
- The ComfyUI workflow is hardcoded and minimal. There is no support for seeds, batches, aspect presets, custom workflows, LoRA controls, refiner/upscale passes, image-to-image, or reusable templates.
- The UI is modal-heavy and operational. It does not yet feel like a visual adaptation surface: no gallery, scene image dock, thumbnail timeline, compare/regenerate flow, or per-passage image association.
- Job state lives mostly in renderer timers. There is no durable job model, progress reporting, retry strategy, queue view, or robust cancellation behavior.
- Metadata sidecars are too thin for reproducibility. They do not include source passage text, final prompt, negative prompt, generation config, checkpoint, seed, workflow version, scene identity, or source game information.
- Integration coverage does not currently exercise the Illustrator UI with mocked local services.

## Design Principles

- Trust boundaries first: no renderer-controlled arbitrary filesystem writes.
- Preserve optionality: the app must play Twine games normally when AI services are unavailable.
- Local-first: default to localhost services, clearly label LAN or remote endpoints, and never require cloud accounts.
- Reproducible outputs: every generated image should have enough metadata to understand and rerun it.
- Game-aware, not game-invasive: capture context without modifying the Twine game file.
- Progressive complexity: simple default flow for players, advanced ComfyUI controls hidden behind an advanced section.
- Testable slices: each implementation slice should add focused Node tests and, where practical, Electron integration coverage with mocked services.

## Recommended Implementation Order

1. Harden Illustrator path authorization and output writes.
2. Introduce a generation metadata model.
3. Extract testable Illustrator renderer helpers.
4. Add service profiles and connection health checks.
5. Improve scene capture and passage context.
6. Add prompt templates, style bible, and character memory.
7. Upgrade ComfyUI workflow construction.
8. Move generation into a job model with progress and retries.
9. Add per-game gallery and scene image dock.
10. Add integration tests and documentation polish.

## Slice 1: Harden Illustrator Path Authorization

**Status:** Completed.

### Problem

Save IPC handlers require a selected, readable, authorized HTML game path before writing sidecar saves. Illustrator output paths do not currently use the same boundary. A compromised or buggy renderer could pass an arbitrary `gamePath` to Illustrator IPC and cause sidecar directory creation or image writes outside the intended game context.

Relevant files:
- `src/main/ipc-handlers.js`
- `src/main/illustrator-service.js`
- `src/main/file-utils.js`
- `preload.js`
- `test/ipc-handlers.test.js`
- `test/illustrator-service.test.js`

### Implementation

- Reuse the existing main-process game path authorizer for Illustrator write operations.
- Require authorization before:
  - `illustrator:ensure-output-dir`
  - `illustrator:poll-image` when `gamePath` is provided and a local copy will be written
  - any future gallery/list/delete/open operations
- Keep non-writing operations, such as model listing and prompt generation, independent of game path authorization.
- Make rejected Illustrator operations return normalized `{ success: false, error }` responses.
- Consider moving authorizer creation into a small main-process module if `ipc-handlers.js` becomes too crowded.

### Tests

- Selected game paths can create an illustration output directory.
- Unknown game paths are rejected for output directory creation and image copy.
- Authorized paths must still resolve to the same readable `.html` or `.htm` file.
- Prompt generation and model listing still work without a game path.

### Acceptance Criteria

- Renderer-controlled arbitrary paths cannot cause Illustrator sidecar writes.
- Existing save authorization behavior is unchanged.
- `npm run check` passes.

### Progress Notes

- Illustrator output directory creation now requires the selected game path to pass the same main-process authorization and readable HTML revalidation used by save operations.
- Illustrator image polling revalidates an authorized game path before writing local copies or metadata sidecars; polling without a game path remains available for preview-only flows.
- IPC coverage verifies authorized output creation, unknown path rejection, stale selected-file rejection, authorized image copying, and model/prompt operations without a game path.

## Slice 2: Rich Generation Metadata

**Status:** Completed.

### Problem

Generated image sidecars currently include only prompt ID, filename, content type, and generated timestamp. That is not enough to reproduce, audit, search, or associate images with passages.

Relevant files:
- `src/main/illustrator-service.js`
- `src/main/illustrator-config.js`
- `src/main/file-utils.js`
- `src/game/illustrator-ui.js`
- `test/illustrator-service.test.js`

### Implementation

- Add a versioned metadata schema, for example `twinePlayerIllustrationVersion: 1`.
- Include:
  - game path basename or stable game identity, not necessarily full path in user-visible UI
  - passage title or passage identity when available
  - source scene text excerpt and hash
  - final image prompt
  - negative prompt
  - text backend, text model, and prompt-generation timestamp
  - ComfyUI endpoint origin, checkpoint, width, height, sampler, scheduler, steps, CFG, seed
  - ComfyUI prompt ID and source output filename
  - local filename, content type, byte size, and generated timestamp
  - workflow template/version
- Pass metadata-relevant fields into `queueComfyUI()` and `pollImage()` explicitly rather than relying on renderer globals.
- Add a metadata normalizer so future gallery reads can tolerate old sidecars.

### Tests

- Metadata is written with all required fields for a successful mocked generation.
- Old minimal metadata normalizes without throwing.
- User-provided strings are length-limited and written as JSON strings, not HTML.
- Metadata write failure does not prevent returning the generated image if the image copy succeeded.

### Acceptance Criteria

- New generated images are reproducible from sidecar metadata.
- Metadata remains backward-compatible with existing generated files.

### Progress Notes

- Local image sidecars now use `twinePlayerIllustrationVersion: 1` with game, passage, scene, prompt, ComfyUI, output, and workflow sections.
- `queueComfyUI()` returns the actual seed sent to the default workflow so the renderer can pass it into saved metadata.
- `pollImage()` accepts explicit metadata context, records bounded scene/prompt strings and a scene hash, and preserves successful image copies when metadata writing fails.
- A metadata normalizer handles old minimal sidecars with prompt ID, filename, content type, and generated timestamp.

## Slice 3: Extract Illustrator Renderer Helpers

**Status:** Completed.

### Problem

`src/game/illustrator-ui.js` is currently one large browser-global script. It mixes DOM queries, settings normalization, status display, service calls, polling timers, and image state. That will make feature additions risky.

Relevant files:
- `src/game/illustrator-ui.js`
- `src/shared/game-player-helpers.js`
- `test/game-player-helpers.test.js`
- `test/illustrator-config.test.js`

### Implementation

- Extract pure helpers into a browser/Node-compatible module, likely `src/shared/illustrator-helpers.js`.
- Good first helpers:
  - `normalizeRendererIllustratorConfig()`
  - `createOutputFilename(now, passageIdentity)`
  - `hashSceneText(text)`
  - `createSceneExcerpt(text, maxLength)`
  - `getIllustrationDisplayState(status, hasImage)`
  - `normalizeIllustrationMetadata(raw)`
- Convert display toggles from direct `element.style.display` mutation to CSS classes where practical.
- Keep classic script loading until tests make a module-system change worthwhile.

### Tests

- Config read from DOM-like values normalizes the same way as main-process config where applicable.
- Output filenames are plain filenames and stable enough for tests.
- Scene hashing/excerpts are deterministic and bounded.
- Display-state helpers cover idle, working, done, error, and canceled states.

### Acceptance Criteria

- Pure Illustrator behavior is covered by Node tests.
- The UI script is smaller and easier to modify.
- Existing modal behavior is preserved.

### Progress Notes

- Added `src/shared/illustrator-helpers.js` as a browser/Node-compatible helper module loaded before the Illustrator UI.
- Extracted renderer config normalization, output filename creation, scene hashing/excerpts, display-state decisions, and metadata normalization into pure tested helpers.
- Updated the Illustrator UI to use helper-driven config, filenames, scene excerpts, and CSS class toggles for spinner/image/download/cancel visibility.
- Reused the shared metadata normalizer from the main Illustrator service to avoid drift between sidecar writes and future gallery reads.

## Slice 4: Service Profiles and Health Checks

**Status:** Completed.

### Problem

The user can configure endpoints and models, but the app does not provide a clear connection diagnostic flow. Opening the modal currently triggers model listing, which doubles as both setup and health check. Errors are terse and service-specific.

Relevant files:
- `game.html`
- `src/game/illustrator-ui.js`
- `src/main/illustrator-config.js`
- `src/main/illustrator-service.js`
- `src/main/ipc-handlers.js`
- `test/illustrator-service.test.js`

### Implementation

- Add an explicit "Test connections" action.
- Add main-process health helpers:
  - text backend reachable
  - selected text model available
  - ComfyUI reachable
  - selected checkpoint available
- Persist named service profiles in `localStorage`, such as:
  - Local Ollama + Local ComfyUI
  - LAN OpenAI-compatible + Local ComfyUI
  - custom profile
- Visually label endpoints as `Local`, `LAN`, or `Remote` based on host classification. This is UX guidance, not a security boundary.
- Keep endpoint validation in main process.
- Avoid auto-changing the user's selected model when model refresh fails.

### Tests

- Health check returns structured statuses for all services.
- OpenAI-compatible and Ollama paths are both covered.
- Renderer falls back gracefully when services are unreachable.
- Stored profiles normalize malformed entries.

### Acceptance Criteria

- Users can understand setup failures before starting generation.
- Existing direct model-refresh buttons continue to work.

### Progress Notes

- Added main-process Illustrator health checks for text backend reachability, selected text model availability, ComfyUI reachability, and selected checkpoint availability.
- Added `illustrator:check-health` IPC/preload access and a renderer "Test Connections" action with structured status summaries.
- Added localStorage-backed service profiles with built-in local/LAN presets and a save-current-profile flow.
- Added endpoint classification badges (`Local`, `LAN`, `Remote`, `Invalid`) as UX guidance while keeping endpoint validation in the main process.
- Added Node coverage for health checks, OpenAI-compatible and Ollama model paths, malformed profile normalization, and endpoint classification.

## Slice 5: Scene Capture and Passage Context

**Status:** Completed.

### Problem

The current capture grabs visible iframe text once when the modal opens. VN/comic adaptation needs better context: current passage, recent passages, speaker/dialogue cues, and a stable scene identity.

Relevant files:
- `src/game/illustrator-ui.js`
- `src/game/save-modal.js`
- `src/game/twine-bridge.js`
- `src/game/player.js`
- `test/electron-integration.js`
- `test/fixtures/*.html`

### Implementation

- Add a scene context helper that can extract:
  - current visible passage text
  - document title
  - Twine passage name where available
  - SugarCube passage name where available, if accessible without breaking unsupported engines
  - recent captured passage texts in a bounded in-memory ring buffer
- Add a "Recapture" button in the Illustrator panel.
- Add optional auto-capture on passage changes:
  - Use a MutationObserver on likely passage containers.
  - Keep the observer non-fatal and disabled when iframe access fails.
  - Throttle updates so the UI does not churn during transitions.
- Store a scene hash and passage identity with generation metadata.
- Preserve manual editing: recapture should not overwrite edited scene text without an explicit action or dirty-state confirmation.

### Tests

- Fixture game passage text is captured on modal open.
- Recapture updates scene text after a passage change.
- Manual edits are not overwritten by background capture.
- Cross-origin or inaccessible iframe handling stays non-fatal.

### Acceptance Criteria

- The Illustrator can reliably target the current scene.
- Captured context remains bounded and safe for prompt generation limits.

### Progress Notes

- Added scene-context helpers for bounded text, excerpts, scene hashes, passage identity, and recent in-memory context history.
- Added a Recapture action and scene context summary to the Illustrator modal.
- Scene capture now records document title, best-effort SugarCube passage name, Twine passage data matches, current scene hash, and passage identity without modifying the game file.
- Added throttled MutationObserver auto-capture for likely passage containers; background capture does not overwrite manually edited scene text.
- Generation metadata now receives the captured passage identity/title when the scene text has not been manually edited.

## Slice 6: Prompt Templates, Style Bible, and Character Memory

**Status:** Completed.

### Problem

The current prompt instruction is generic and stateless. VN/comic adaptation needs visual consistency across scenes: recurring characters, art direction, composition choices, and tone.

Relevant files:
- `game.html`
- `src/game/illustrator-ui.js`
- `src/main/illustrator-service.js`
- `src/main/illustrator-config.js`
- `test/illustrator-service.test.js`

### Implementation

- Add per-game Illustrator project settings in `localStorage`:
  - visual style bible
  - character roster
  - world/location notes
  - default shot style, such as VN background, character CG, comic panel, establishing shot
  - prompt language/tone preferences
- Add prompt template modes:
  - `VN scene background`
  - `VN character CG`
  - `Comic panel`
  - `Manga panel`
  - `Concept art`
- Update `createVisualPromptInstruction()` to accept structured context:
  - scene text
  - recent context
  - style bible
  - character notes
  - mode
  - constraints, such as no speech bubbles or readable text unless requested
- Keep the generated prompt editable before image generation.
- Store both the generated prompt and the source template mode in metadata.

### Tests

- Prompt instruction includes style bible and character notes when provided.
- Prompt instruction remains bounded and rejects oversized scene/context inputs.
- Each prompt mode produces distinguishable instruction text.
- Existing simple prompt generation still works with default settings.

### Acceptance Criteria

- Users can build consistent visual identity across a game.
- Prompt generation is still simple for first-time users.

### Progress Notes

- Added per-game Illustrator project settings in localStorage for style bible, character roster, world notes, prompt mode, and prompt tone.
- Added prompt template modes for VN background, VN character CG, comic panel, manga panel, and concept art.
- `createVisualPromptInstruction()` now accepts bounded structured context, includes continuity/style fields when present, and preserves the original simple scene-only path.
- Generated prompt requests include recent captured scene context when available, and image metadata records the source prompt template mode.
- Added Node coverage for project setting normalization, prompt mode distinctions, style/character inclusion, and oversized context rejection.

## Slice 7: ComfyUI Workflow Builder Upgrade

**Status:** Completed.

### Problem

The current ComfyUI workflow is fixed and seedless from the user's perspective. Useful generation requires repeatability, aspect presets, batches, and an extension path for advanced workflows.

Relevant files:
- `src/main/illustrator-service.js`
- `src/main/illustrator-config.js`
- `game.html`
- `src/game/illustrator-ui.js`
- `test/illustrator-service.test.js`

### Implementation

- Extract workflow construction into a dedicated builder function.
- Add config fields:
  - seed, with `random` as a first-class UI option
  - batch size, clamped conservatively
  - aspect preset, such as portrait, landscape, square, VN background, comic panel
  - optional output prefix strategy using passage identity
- Return the actual seed used from `queueComfyUI()` so metadata can record it.
- Add an advanced custom workflow mode:
  - user imports/pastes ComfyUI workflow JSON
  - TwinePlayer replaces declared placeholders for prompt, negative prompt, checkpoint, seed, width, and height
  - strict validation rejects workflows without known prompt/image output nodes
  - keep this behind an advanced section
- Do not introduce external ComfyUI node dependencies by default.

### Tests

- Default workflow remains compatible with existing tests.
- Seed handling is deterministic when specified and random when requested.
- Batch size and dimensions are clamped.
- Custom workflow placeholder replacement is tested with a small fixture.
- Invalid custom workflows fail with clear errors.

### Acceptance Criteria

- Generations can be reproduced by seed and metadata.
- Advanced users can use custom workflows without breaking the simple default path.

### Progress Notes

- Extracted ComfyUI workflow construction into `buildComfyUIWorkflow()`.
- Added seed, batch size, aspect preset, workflow mode, and custom workflow JSON config fields with normalization and renderer controls.
- Default workflows now return the actual seed, width, and height used, and batch size is clamped conservatively.
- Added guarded custom workflow support with placeholder replacement for prompt, negative prompt, checkpoint, seed, width, height, batch size, and output prefix.
- Custom workflows are validated for prompt text and SaveImage output nodes before queueing.

## Slice 8: Job Model, Progress, Retry, and Cancellation

**Status:** Completed.

### Problem

The renderer owns the polling interval and only knows "pending" or "done." There is no durable job state, progress timeline, retry action, or robust cancellation semantics.

Relevant files:
- `src/main/illustrator-service.js`
- `src/main/ipc-handlers.js`
- `preload.js`
- `src/game/illustrator-ui.js`
- `test/illustrator-service.test.js`
- `test/ipc-handlers.test.js`

### Implementation

- Introduce a main-process job record for queued Illustrator work:
  - local job ID
  - ComfyUI prompt ID
  - status: queued, polling, completed, failed, canceled, timed_out
  - timestamps
  - prompt/config snapshot
  - last error
  - output metadata when complete
- Add IPC methods:
  - `illustrator:start-generation`
  - `illustrator:get-job`
  - `illustrator:list-jobs`
  - `illustrator:cancel-job`
- Keep existing low-level IPC temporarily if needed for compatibility, then retire it after the UI switches.
- Add retry from a failed or timed-out job using the same metadata snapshot.
- Add best-effort cancellation:
  - always stop TwinePlayer polling
  - optionally call a ComfyUI cancellation endpoint only after verifying the endpoint behavior and guarding failures
- Surface elapsed time and retry/cancel actions in the UI.

### Tests

- Starting a job creates a job record.
- Polling transitions pending to completed.
- Timeout transitions to `timed_out`.
- Cancel stops local polling and marks the job canceled.
- Retry creates a new job with the previous prompt/config snapshot.

### Acceptance Criteria

- Renderer refreshes or modal closes do not lose all knowledge of an active job during the current app session.
- Users can see what happened when generation fails.

### Progress Notes

- Added in-memory main-process Illustrator job records with local job IDs, ComfyUI prompt IDs, statuses, timestamps, elapsed time, config/prompt/metadata snapshots, last errors, and completion output.
- Added main-owned polling timers plus guarded `get-job` refreshes so active jobs survive modal close/reopen during the app session.
- Added IPC/preload APIs for start, get, list, cancel, and retry while keeping the existing low-level queue/poll methods for compatibility.
- Cancellation now stops local TwinePlayer polling and marks active jobs canceled; retries create a new job from failed or timed-out snapshots.
- The Illustrator modal now restores the latest per-game job, surfaces elapsed job details, and exposes cancel/retry actions.

## Slice 9: Per-Game Gallery and Scene Image Dock

**Status:** Completed.

### Problem

Generated images appear only in the modal and through the filesystem. A VN/comic adaptation needs a visual workspace: gallery, current scene image, regenerate/compare, and quick access while playing.

Relevant files:
- `game.html`
- `src/game/game.css`
- `src/game/illustrator-ui.js`
- `src/main/illustrator-service.js`
- `src/main/ipc-handlers.js`
- `preload.js`
- `test/electron-integration.js`

### Implementation

- Add main-process gallery operations:
  - list illustration metadata/images for the authorized game
  - read image as data URL for display
  - delete illustration and sidecar metadata
  - optionally reveal output directory through a safe shell API later
- Add an in-game illustration dock:
  - current scene image preview
  - thumbnail strip for recent outputs
  - open full gallery
  - send selected image to dock
  - hide/show without affecting gameplay
- Add gallery filters:
  - current passage
  - all images for this game
  - failed/timed-out jobs if job metadata is persisted later
- Add compare/regenerate flow:
  - duplicate prompt/config from selected image
  - vary seed
  - copy prompt to editor
- Keep image rendering bounded to avoid loading huge galleries at once.

### Tests

- Gallery list rejects unauthorized game paths.
- Gallery reads only files inside the authorized illustration directory.
- Renderer shows a generated image thumbnail after mocked generation.
- Delete removes image and sidecar together.
- Dock can be hidden, shown, and keyboard navigated.

### Acceptance Criteria

- Generated images are discoverable inside TwinePlayer.
- The player can use the app like a lightweight VN/comic adaptation viewer.

### Progress Notes

- Added authorized gallery operations for listing illustration metadata, reading images as data URLs, and deleting images with their sidecar metadata.
- Added a bounded in-modal gallery with current-scene/all filters, thumbnail loading, dock assignment, delete, and prompt reuse for regeneration with a varied seed.
- Added an in-game illustration dock with a preview, recent thumbnail strip, top-bar toggle, hide control, and keyboard arrow navigation between thumbnails.
- Completed Node coverage for unauthorized gallery access, safe image reads, delete-with-sidecar behavior, and dock accessibility affordances.
- Kept Electron integration tests unrun per project instruction.

## Slice 10: UI, Accessibility, and Reduced-Motion Polish

**Status:** Completed.

### Problem

The current Illustrator modal is usable but dense. As features grow, it needs clearer structure and stronger accessibility guarantees.

Relevant files:
- `game.html`
- `src/game/game.css`
- `src/game/illustrator-ui.js`
- `test/accessibility.test.js`
- `test/electron-integration.js`

### Implementation

- Split the modal into tabs or sections:
  - Scene
  - Prompt
  - Generate
  - Gallery
  - Settings
- Add clear labels and `aria-describedby` relationships for endpoint/model/status controls.
- Make the status region polite-live for progress updates.
- Replace visual-only loading states with semantic disabled/busy states.
- Keep focus trapping and focus return behavior.
- Add keyboard shortcuts only if discoverable through button titles or menu labels.
- Move remaining display toggles to CSS classes.
- Respect reduced-motion for spinners and modal transitions.
- Ensure mobile/narrow viewport layout stays usable.

### Tests

- Accessibility policy tests cover labels, dialog descriptions, live status, focus return, and keyboard access.
- Reduced-motion tests cover Illustrator spinner/transition behavior.
- Integration tests cover opening/closing tabs and triggering core actions with keyboard.

### Acceptance Criteria

- The Illustrator remains comfortable to use as it gains features.
- No primary action requires a mouse.

### Progress Notes

- Split the Illustrator modal into semantic Scene, Settings, Prompt, Generate, and Gallery sections without changing the underlying workflow.
- Added dialog description wiring, polite live status updates, endpoint/model descriptions, and semantic busy states for prompt/model/generation operations.
- Added reduced-motion safeguards for Illustrator spinners and modal motion, plus narrow-viewport layout rules for the modal and dock.
- Extended accessibility policy tests for Illustrator sections, live regions, described controls, dock keyboard navigation, and busy-state wiring.
- Electron integration coverage remains unrun per project instruction.

## Slice 11: Integration Tests With Mock AI Services

**Status:** Completed.

### Problem

Node tests cover main-process service behavior, but the user-facing Illustrator workflow is not covered end to end.

Relevant files:
- `test/electron-integration.js`
- `test/fixtures/*.html`
- `src/main/illustrator-service.js`
- `src/game/illustrator-ui.js`

### Implementation

- Add a lightweight HTTP fixture server for:
  - Ollama model list
  - Ollama prompt generation
  - OpenAI-compatible model list
  - OpenAI-compatible chat completion
  - ComfyUI object info
  - ComfyUI prompt queue
  - ComfyUI history pending/done
  - ComfyUI image view
- Run the fixture server from the integration test process.
- Drive the real UI:
  - load a fixture Twine game
  - open Illustrator
  - capture scene text
  - generate prompt
  - generate image
  - verify image preview and metadata output
  - cancel a pending job
  - show service failure states
- Preserve the existing GPU-process infrastructure skip for environments that cannot launch Electron.

### Tests

- Happy path with mocked services.
- Text backend failure.
- ComfyUI queue failure.
- ComfyUI image content-type rejection.
- Pending job cancellation.

### Acceptance Criteria

- Illustrator regressions become visible before release.

### Progress Notes

- Added a mock AI HTTP fixture server inside `test/electron-integration.js` covering Ollama, OpenAI-compatible chat/models, ComfyUI model info, queue, history, and image view endpoints.
- Added UI-driven integration scenarios for the Illustrator happy path, text backend failure, ComfyUI queue failure, bad image content type, and pending job cancellation.
- The new integration coverage uses temporary fixture copies so generated illustration sidecars do not dirty repository fixtures.
- Per instruction, the integration test file was syntax-checked but the integration suite was not executed.
- Tests do not require real Ollama, OpenAI-compatible servers, or ComfyUI.

## Slice 12: Documentation and Release Readiness

**Status:** Planned.

### Problem

The Illustrator is powerful but depends on external local services. Users need setup guidance, troubleshooting, and clarity about where generated assets go.

Relevant files:
- `README.md`
- `docs/documentation.md`
- `docs/ai-illustrator-improvement-plan.md`

### Implementation

- Document the default simple workflow.
- Document local service setup:
  - Ollama
  - OpenAI-compatible local server
  - ComfyUI
- Document output folder and metadata sidecars.
- Document privacy expectations:
  - scene text is sent to the configured text endpoint
  - prompts are sent to the configured ComfyUI endpoint
  - local endpoints are default
  - remote endpoints are user-selected
- Add troubleshooting for:
  - unreachable endpoint
  - model list empty
  - checkpoint missing
  - generation pending forever
  - image saved in ComfyUI but not copied locally
- Update release checklist to include mocked Illustrator workflow tests and one manual local-service smoke test when available.

### Acceptance Criteria

- A new user can understand how to set up the Illustrator.
- A future Codex run can tell what remains planned and what is complete.

## Trust and Safety Review Notes

- The highest-priority engineering issue is Illustrator path authorization. Do this before adding gallery delete/read operations or richer output writes.
- Treat scene text and prompts as potentially sensitive. Do not log full scene text or prompts to console by default.
- Keep endpoint validation in the main process. Renderer validation is only user feedback.
- Do not fetch arbitrary image URLs from the renderer. Continue deriving image URLs from ComfyUI history responses and validated endpoint config.
- Enforce response size limits for JSON and images.
- Keep generated filenames plain and resolved inside the authorized illustration directory.
- Clearly label non-local endpoints because scene text may leave the user's machine when they choose a LAN or remote server.

## Verification Standard For Each Slice

1. Keep the slice focused and avoid unrelated UI rewrites.
2. Add or update Node tests for pure/main-process behavior.
3. Add or update Electron integration coverage for user-visible flows when practical.
4. Run `npm run check`.
5. Run `npm run test:integration` for UI slices, accepting the documented GPU-process infrastructure skip only when it occurs.
6. Update this plan with completed status and progress notes.

## Suggested First Execution Task

Start with Slice 1. It is the trust boundary that should be fixed before the Illustrator gains gallery operations, richer metadata writes, or any broader filesystem surface.
