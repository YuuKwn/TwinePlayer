# TwinePlayer Documentation

TwinePlayer is an Electron desktop app for playing Twine HTML games in a dedicated, browser-profile-free environment.

The planned implementation phases are complete as of the current project state. The app now has a modular Electron structure, a hardened IPC surface, extracted game-renderer modules, reliable local save handling, searchable/relinkable library management, optional AI illustration support, automated checks, and release-oriented build targets.

## Requirements

To run from source:
- Node.js 18 or later
- npm
- Git

Optional Illustrator services:
- Ollama, default endpoint `http://localhost:11434`
- OpenAI-compatible local text server, such as llama.cpp or MLX/oMLX, endpoint including `/v1`
- ComfyUI, default endpoint `http://localhost:8188`

## Development

```bash
npm install
npm start
npm run check
```

`npm run check` runs JavaScript syntax checks and the Node test suite.

The project uses Electron 30 and Electron Builder 26. The GitHub Actions workflow in `.github/workflows/check.yml` runs `npm ci` and `npm run check` on `windows-latest` for pushes to `main` and pull requests.

## Build Commands

```bash
npm run build:win
npm run build:win:portable
npm run build:linux
npm run build:all
```

Outputs are written to `dist/`.

## Core Features

### Library

- Tracks loaded Twine games in `localStorage`.
- Uses safe JSON storage helpers so corrupt library data falls back cleanly and is backed up once.
- Extracts titles from `<tw-storydata name>`, then `<title>`, then filename fallback.
- Search by title/path.
- Sort by last played, title, or path.
- Detects missing files and supports relinking.
- Renders user-controlled titles and paths through DOM APIs instead of HTML injection.

### Save Engine

- Saves are stored next to each game in `<game>_saves/`.
- Save filenames are validated in renderer and main process.
- Filesystem work is async in the main process.
- Save writes are atomic: write temp file, then rename into place.
- Stale temp save files are cleaned opportunistically.
- Save slots render filenames, dates, and sizes through `textContent`.
- Failed save/load/delete operations keep the save modal open and show/log the failure instead of silently closing.

### Developer Console

- Runs JavaScript in the loaded game iframe.
- Supports autocomplete.
- Saves commands per game identity where IFID is available.
- Supports overlay and side-by-side layouts.
- Corrupt saved command storage falls back safely.
- Shows a visible scope warning because console commands execute inside the loaded game context.

### Illustrator

The Illustrator is experimental, optional, and local-first. TwinePlayer can play games normally when no AI services are installed.

Prompt text backends:
- `Ollama`: default endpoint `http://localhost:11434`; uses `/api/tags` and `/api/generate`.
- `OpenAI-compatible`: endpoint must include `/v1`; uses `/v1/models` and `/v1/chat/completions`.

The OpenAI-compatible backend is intended for local servers such as llama.cpp and MLX/oMLX. If the server runs on a Mac on your LAN, set the endpoint in the Illustrator panel to something like:

```text
http://192.168.1.20:8080/v1
```

ComfyUI is the image backend. The default endpoint is:

```text
http://localhost:8188
```

Default simple workflow:

1. Open a game and click **Illustrate**.
2. Confirm or recapture the current scene text.
3. Pick a prompt mode and optionally add style, character, world, or tone notes.
4. Generate a prompt through the configured text backend, or write one manually.
5. Pick a ComfyUI checkpoint and generation settings.
6. Queue the image.
7. Watch the job status, retry failures, cancel local polling, and review finished images in the modal gallery or Art Dock.

ComfyUI generation settings are configurable:
- endpoint
- checkpoint
- width/height
- aspect preset
- seed, including `random`
- batch size
- sampler
- scheduler
- steps
- CFG
- negative prompt
- custom workflow JSON in the advanced workflow section

Generated images are copied into `<game>_illustrations/` with a metadata `.json` sidecar. Example:

```text
My Story.html
My Story_illustrations/
  mock-output.png
  mock-output.png.json
```

The sidecar records game, passage, scene excerpt/hash, prompt, text backend, ComfyUI checkpoint/settings, seed, workflow template/version, output size, and local filename.

The modal gallery lists recent generated images for the current game, can filter to the current scene, can copy a previous prompt back into the editor with a randomized seed, and can delete an image plus its sidecar. The Art Dock is an in-game preview surface for selected gallery images and recent thumbnails.

Privacy expectations:

- Scene text is sent to the configured text endpoint when generating a prompt.
- Final image prompts are sent to the configured ComfyUI endpoint when queueing an image.
- Local endpoints are the defaults.
- LAN or remote endpoints are user-selected; TwinePlayer labels endpoint locality in the UI.
- Full scene text and prompts are not logged to the console by default.

Settings are persisted in `localStorage` and normalized by the main-process configuration layer before use. HTTP handling validates status codes, JSON response shapes, response sizes, image content types, and endpoint URL schemes.

## Architecture

TwinePlayer follows Electron's hardened renderer pattern:

- `main.js`: app lifecycle and window creation.
- `preload.js`: exposes safe APIs through `contextBridge`.
- `src/storage-utils.js`: safe JSON read/write helpers for renderer storage.
- `src/renderer.js`: library UI, metadata loading, search/sort, missing-file handling, and relink flow.
- `src/index.css`: library page styling.
- `src/main/ipc-handlers.js`: registers IPC handlers.
- `src/main/save-service.js`: save file operations.
- `src/main/illustrator-service.js`: local AI service HTTP calls, jobs, gallery reads, and metadata writes.
- `src/main/illustrator-config.js`: Illustrator defaults and config normalization.
- `src/main/game-metadata.js`: title metadata extraction.
- `src/main/file-utils.js`: path, URL, sidecar directory, and filename helpers.
- `src/main/validation.js`: shared main-process validation helpers.
- `src/game/*.js`: game player modules.
- `src/game/game.css`: game player styling.

Renderer pages have `nodeIntegration: false` and `contextIsolation: true`.

The game player is split into classic scripts that load in deterministic order:

- `src/game/player.js`: player shell state and shared helpers.
- `src/game/twine-bridge.js`: iframe save/scene bridge and message handling.
- `src/game/dev-console.js`: developer console UI and command execution.
- `src/game/save-engine.js`: save capture, restore, and filename validation.
- `src/game/save-modal.js`: save/load/delete modal behavior and accessibility.
- `src/game/illustrator-ui.js`: Illustrator panel, settings, jobs, gallery, Art Dock, and cancel/retry behavior.
- `src/game/bootstrap.js`: query parsing, file existence checks, iframe startup, and module initialization.

## IPC APIs

### `window.electronAPI`

| Method | Purpose |
| --- | --- |
| `openFile()` | Open a native Twine file picker. |
| `toFileUrl(filePath)` | Convert a filesystem path to a safe file URL. |
| `fileExists(filePath)` | Check whether a game file still exists. |
| `getGameMetadata(filePath)` | Extract Twine/document title metadata. |
| `listSaves(gamePath)` | List saves for a game. |
| `writeSave(gamePath, filename, bufferArray)` | Write save bytes. |
| `readSave(gamePath, filename)` | Read save bytes. |
| `deleteSave(gamePath, filename)` | Delete a save. |

### `window.illustratorAPI`

| Method | Purpose |
| --- | --- |
| `getDefaultConfig()` | Return Illustrator defaults. |
| `ensureOutputDir(gamePath)` | Create `<game>_illustrations/`. |
| `listGallery(gamePath, options)` | List generated illustration metadata for a game. |
| `readGalleryImage(gamePath, filename)` | Read a generated illustration as a data URL. |
| `deleteGalleryImage(gamePath, filename)` | Delete a generated illustration and sidecar metadata. |
| `listTextModels(config)` | List Ollama or OpenAI-compatible models. |
| `listOllamaModels(config)` | Backward-compatible alias for text model listing. |
| `listComfyUIModels(config)` | List ComfyUI checkpoints. |
| `checkHealth(config)` | Check configured text and ComfyUI service reachability. |
| `generatePrompt(sceneText, model, config)` | Generate an image prompt. |
| `startGeneration(params)` | Create a main-process generation job and queue ComfyUI. |
| `getJob(jobId)` | Read and advance a generation job. |
| `listJobs(params)` | List in-memory generation jobs for the current app session. |
| `cancelJob(jobId)` | Stop local polling and mark an active job canceled. |
| `retryJob(jobId)` | Retry a failed or timed-out job from its saved snapshot. |
| `queueComfyUI(params)` | Queue a ComfyUI workflow. |
| `pollImage(params)` | Poll for a generated image. |

## Automated Tests

`npm run check` currently performs syntax checks for:

- Electron entry points: `main.js`, `preload.js`
- Shared renderer utility: `src/storage-utils.js`
- Main-process modules under `src/main/`
- Game renderer modules under `src/game/`

It then runs `npm test`, which loads the Node test suite:

- `test/file-utils.test.js`
- `test/game-metadata.test.js`
- `test/illustrator-config.test.js`
- `test/illustrator-helpers.test.js`
- `test/illustrator-service.test.js`
- `test/ipc-handlers.test.js`
- `test/save-service.test.js`
- `test/storage-utils.test.js`
- `test/validation.test.js`

Coverage focuses on path and filename safety, metadata extraction, storage fallback behavior, async/atomic saves, Illustrator configuration and HTTP handling, job state, gallery operations, IPC handler response shapes, accessibility policies, and validation edge cases.

`test/electron-integration.js` contains mocked Illustrator UI flows for prompt generation, image generation, service failures, bad image responses, and cancellation. Run it manually with:

```bash
npm run test:integration
```

For this Codex run, integration tests were intentionally not executed at the user's request. `npm run check` still syntax-checks the integration file.

## Troubleshooting

### Save Not Detected

Use the top-bar Save button. If a game exposes its own Save to Disk button, TwinePlayer attempts to intercept it, but some custom Twine builds may require the top-bar fallback.

### Unsupported Twine Engine

The save bridge focuses on SugarCube-style save APIs. Unsupported engines may still play normally, but automatic save capture/restore can fail. The console logs the detected engine and any save errors.

### Ollama Unavailable

Confirm Ollama is running and the endpoint is correct:

```bash
ollama pull llama3.2
ollama serve
```

Then use `http://localhost:11434` in the Illustrator panel.

If the model list is empty, pull at least one model and refresh the model list:

```bash
ollama pull llama3.2
```

### llama.cpp or MLX/oMLX Unavailable

Use the OpenAI-compatible backend and include `/v1` in the endpoint. Confirm the server exposes:

- `GET /v1/models`
- `POST /v1/chat/completions`

If the server is on a Mac, make sure the Windows machine can reach the Mac's LAN IP and that the server binds to a non-loopback interface.

### ComfyUI Unavailable

Confirm ComfyUI is running and reachable at the configured endpoint, usually `http://localhost:8188`. The selected checkpoint must exist in ComfyUI.

If the checkpoint list is empty or a selected checkpoint is reported missing, confirm that ComfyUI has finished startup and that the checkpoint file is in a directory ComfyUI scans.

### Generation Pending Forever

TwinePlayer polls ComfyUI history until the configured timeout. If a job stays pending:

- Check the ComfyUI queue in the browser UI.
- Confirm the workflow has a `SaveImage` output.
- Confirm ComfyUI is not waiting for a missing custom node or model.
- Try canceling local polling in TwinePlayer, then retry with a smaller image size or fewer steps.

Canceling in TwinePlayer stops local polling and marks the job canceled in the app. It does not currently cancel work already queued inside ComfyUI.

### Image Saved In ComfyUI But Not Copied Locally

TwinePlayer copies the first image found in ComfyUI history into `<game>_illustrations/`. If ComfyUI saved an image but TwinePlayer did not copy it:

- Confirm the selected game path is still readable and authorized.
- Confirm the ComfyUI `/view` endpoint returns an image content type.
- Check whether the generated filename contains path-like characters; TwinePlayer only accepts plain image filenames.
- Check the app console for metadata sidecar write warnings.

### CSP or Iframe Limitations

TwinePlayer loads local game HTML files in a sandboxed iframe with scripts enabled. Some highly customized games may behave differently if they depend on browser features outside that sandbox.

## Release Checklist

1. Run `npm install` on a fresh clone.
2. Run `npm run check`.
3. Run `npm run test:integration` when integration-test execution is allowed in the environment.
4. Run `npm start` and smoke test library, player, saves, console, and Illustrator offline states.
5. When local services are available, smoke test one Illustrator happy path with Ollama or an OpenAI-compatible text endpoint plus ComfyUI.
6. Build Windows output with `npm run build:win` or `npm run build:win:portable`.
7. Build Linux output with `npm run build:linux` where supported.
8. Smoke test the packaged app.
9. Confirm generated Illustrator images and `.json` sidecars are written next to the selected game, not into the app install directory.
10. Tag a version and upload artifacts.
