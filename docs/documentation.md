# TwinePlayer — Documentation

> A standalone desktop application to play Twine HTML games, with a built-in library, native save engine, developer console, and AI illustration support.

---

## Table of Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [Getting Started](#getting-started)
5. [Features](#features)
   - [Library](#library)
   - [Save Engine](#save-engine)
   - [Developer Console](#developer-console)
   - [Illustrator (AI)](#illustrator-ai)
   - [UI / Top Bar](#ui--top-bar)
6. [Building from Source](#building-from-source)
7. [Project Structure](#project-structure)
8. [Architecture Overview](#architecture-overview)
9. [IPC API Reference](#ipc-api-reference)
10. [Technology Stack](#technology-stack)
11. [Planned / Future Work](#planned--future-work)
12. [License](#license)

---

## Overview

**TwinePlayer** is a modern Electron-based desktop application built to play [Twine](https://twinery.org/) games without relying on a web browser. It was created to solve a few common frustrations with the browser-based experience:

- Twine game saves being lost when clearing browser storage or switching browsers.
- Not wanting Twine games mixed into a personal browsing session or history.
- Wanting a dedicated, distraction-free space for playing interactive fiction.

The app provides a full-featured player with a game library, native file-based save management, an in-app developer console with JavaScript autocomplete, and an experimental AI Illustrator that generates scene illustrations using locally-running Ollama and ComfyUI.

---

## Requirements

### To Run Pre-Built Binaries

- **Windows 10+** or **Linux** (64-bit)
- No additional dependencies required — the Electron runtime is bundled.

### To Build from Source

- **Node.js** v18 or later
- **npm** (comes with Node.js)
- Git

### For the Illustrator Feature (Optional)

The AI Illustrator is an **optional** feature that requires two local AI services running on your machine:

| Service | Purpose | Default URL |
|---------|---------|------------|
| [Ollama](https://ollama.com/) | Converts scene text into image prompts | `http://localhost:11434` |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | Generates images from prompts via Stable Diffusion | `http://127.0.0.1:8188` |

A compatible Stable Diffusion checkpoint must be available in ComfyUI. The default checkpoint used is `waiIllustriousSDXL_v160.safetensors`, but this can be configured in `main.js`.

The Ollama model used is `llama3.2` by default. Make sure it is pulled before enabling the feature:
```bash
ollama pull llama3.2
```

---

## Installation

### Pre-Built Binaries

Download the latest release for your platform from the [Releases](https://github.com/YuuKwn/TwinePlayer/releases) page.

| Platform | Package |
|----------|---------|
| Windows | Installer (`.exe`) |
| Linux | Tarball (`.tar.gz`) |

Run the installer or extract the archive, then launch **TwinePlayer**.

---

## Getting Started

1. **Launch TwinePlayer.** The Library screen is shown on startup.
2. **Click "Load Game"** to open a file picker and select any Twine HTML file (`.html` or `.htm`).
3. The game opens immediately and is automatically added to your library for quick access later.
4. **Click any library card** to replay a previously loaded game.

> **Tip:** Twine games are single HTML files. If you downloaded one from the web or exported one from the Twine editor, just point TwinePlayer at that file.

---

## Features

### Library

The Library is the home screen of TwinePlayer. It provides a visual grid of all previously loaded games.

- **Automatic tracking** — every game you open is added to the library automatically.
- **Sorted by last played** — most recently played games appear first.
- **Metadata display** — each card shows the game title (extracted from the filename), its full path, and the last-played date/time.
- **Remove from library** — click the ✕ button on any card to remove it from the list. This does not delete the file.
- **Persistent** — the library is stored locally via `localStorage`, so it survives app restarts.

**Empty state:** If no games have been loaded yet, the library shows an empty state with instructions to load a game.

---

### Save Engine

TwinePlayer replaces the standard browser-based "Save to Disk" and "Load from Disk" behavior with a native save system.

#### How It Works

- When a Twine game requests a save, TwinePlayer intercepts that action.
- Saves are stored as `.save` files in a folder **next to the game's HTML file**, named `<game-filename>_saves/`.

  **Example:**
  ```
  /my-games/
    echoes-of-nowhere.html
    echoes-of-nowhere_saves/
      slot1.save
      slot2.save
  ```

- Saves are **automatically organized per game** — there is no risk of one game's saves overwriting another's.

#### In-App Save Manager

Access the save manager while a game is running through the top bar:

- **List saves** — paginated view of all save slots for the current game, sorted by most recent.
- **Load** — select a save file to load it into the current game.
- **Delete** — remove a save slot directly from the UI.
- **Metadata** — each entry shows the filename, file size, and last modified date.

#### Why This Is Better Than Browser Saves

| Issue | Browser | TwinePlayer |
|-------|---------|-------------|
| Saves lost on storage clear | ✅ Yes | ❌ Never |
| Saves tied to one browser | ✅ Yes | ❌ No — files are portable |
| Saves organized per game | ❌ No | ✅ Yes, automatic |
| View/manage saves in-app | ❌ No | ✅ Yes |

---

### Developer Console

TwinePlayer includes a custom JavaScript console built specifically for Twine game debugging and cheating.

> This feature was a core motivation for building the app — having easy, in-context access to the Twine engine state without opening the browser DevTools.

#### Features

- **JavaScript execution** — run any JavaScript expression against the running game, including direct access to Twine's internal engine state and story variables.
- **Real-time autocomplete** — suggestions appear as you type, speeding up common commands.
- **Saved commands** — save frequently used snippets (e.g., cheat codes, variable setters) and re-run them with a single click.
- **Per-game command storage** — saved commands are stored per game, identified by IFID (the game's unique identifier embedded in its story data). Commands saved for one game won't appear in another.
- **Two layout modes:**

  | Mode | Description |
  |------|-------------|
  | **Overlay** | Console slides over the game as a floating panel — good for quick checks |
  | **Side-by-side** | The window expands and the console opens beside the game — best for active debugging |

#### Opening the Console

Use the button in the top bar to toggle the console open. Switch between Overlay and Side-by-side mode from within the console panel.

---

### Illustrator (AI)

> ⚠️ **This feature is experimental and requires local AI services.** See [Requirements](#requirements) for setup.

The Illustrator generates scene illustrations for the game you are currently playing, using the current passage text as input.

#### How It Works

1. The current game passage text is sent to **Ollama** (running locally), which converts it into a Stable Diffusion image prompt.
2. The generated prompt is queued in **ComfyUI** (running locally) using a pre-configured workflow.
3. TwinePlayer polls ComfyUI until the image is ready, then displays it in the app.
4. A copy of the generated image is saved to a folder next to the game file, named `<game-filename>_illustrations/`.

#### ComfyUI Workflow Details

The workflow used by TwinePlayer:

| Parameter | Value |
|-----------|-------|
| Image size | 832 × 1216 px (portrait) |
| Sampler | Euler Ancestral |
| Steps | 25 |
| CFG Scale | 7 |
| Default checkpoint | `waiIllustriousSDXL_v160.safetensors` |

The negative prompt automatically filters out common low-quality artifacts (bad anatomy, watermarks, etc.).

#### Customizing the Checkpoint

To use a different model checkpoint, edit the constant in `main.js`:

```js
// main.js
const ILLUSTRATOR_DEFAULT_CHECKPOINT = 'your-model-name.safetensors';
```

---

### UI / Top Bar

The top bar gives you controls while a game is running.

- **Pinned mode** — the bar stays visible at the top and pushes the game content down, so it never overlaps.
- **Auto-hide mode** — the bar hides itself and reappears when you move the cursor to the top of the screen, giving the game the full window area.

Toggle between these two modes from the top bar itself.

---

## Building from Source

### 1. Clone the Repository

```bash
git clone https://github.com/YuuKwn/TwinePlayer.git
cd TwinePlayer
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run in Development Mode

```bash
npm start
```

This launches the app via Electron directly from source. The browser DevTools can be opened from within the app window if needed.

### 4. Build Distributable Packages

| Command | Output |
|---------|--------|
| `npm run build:win` | Windows installer (`.exe`) |
| `npm run build:linux` | Linux tarball (`.tar.gz`) |
| `npm run build:all` | Both platforms |

Build outputs are placed in the `dist/` folder (generated by Electron Builder).

> **Note:** Cross-platform builds (e.g., building a Linux package from Windows) may require additional configuration in `package.json` under the `build` key.

---

## Project Structure

```
TwinePlayer/
├── main.js              # Electron main process — window creation, IPC handlers, save/illustrator logic
├── preload.js           # Exposes safe IPC APIs to the renderer via contextBridge
├── index.html           # Library screen (home screen)
├── game.html            # Game player screen
├── package.json         # Project metadata and Electron Builder config
├── src/
│   ├── renderer.js      # Library screen logic — history, card rendering, game loading
│   └── index.css        # Application styles (custom design system)
└── builder_debug/       # Debug/development build artifacts (not for production)
```

### Key File Roles

| File | Process | Responsibility |
|------|---------|---------------|
| `main.js` | Main (Node.js) | App lifecycle, IPC handlers, native file system operations |
| `preload.js` | Bridge | Exposes `electronAPI` and `illustratorAPI` to renderer pages securely |
| `src/renderer.js` | Renderer | Library screen UI and interaction logic |
| `index.html` | Renderer | Library screen markup |
| `game.html` | Renderer | Game player with top bar, console, save manager, and illustrator UI |

---

## Architecture Overview

TwinePlayer follows the standard Electron security model:

```
┌────────────────────────────────────────────────┐
│  Renderer Process (index.html / game.html)     │
│  - No direct Node.js access                    │
│  - Calls window.electronAPI / illustratorAPI   │
└───────────────────┬────────────────────────────┘
                    │  IPC (contextBridge)
                    ▼
┌────────────────────────────────────────────────┐
│  Preload Script (preload.js)                   │
│  - contextBridge.exposeInMainWorld             │
│  - Maps API calls to ipcRenderer.invoke()      │
└───────────────────┬────────────────────────────┘
                    │  ipcMain.handle()
                    ▼
┌────────────────────────────────────────────────┐
│  Main Process (main.js)                        │
│  - Full Node.js + Electron APIs                │
│  - File system, dialog, HTTP fetch to AI APIs  │
└────────────────────────────────────────────────┘
```

- `contextIsolation: true` and `nodeIntegration: false` are enforced on all windows, keeping the renderer sandboxed.
- All native operations (file I/O, dialog, Ollama/ComfyUI calls) happen exclusively in the main process.

---

## IPC API Reference

### `window.electronAPI`

Exposed to all renderer pages via `preload.js`.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `openFile()` | — | `string \| null` | Opens a native file picker. Returns the selected file path, or `null` if cancelled. |
| `listSaves(gamePath)` | `gamePath: string` | `SaveEntry[]` | Lists all `.save` files for the given game, sorted by most recent. |
| `writeSave(gamePath, filename, bufferArray)` | `gamePath: string`, `filename: string`, `bufferArray: number[]` | `{ success, path?, error? }` | Writes save data to disk. Appends `.save` extension if missing. |
| `readSave(gamePath, filename)` | `gamePath: string`, `filename: string` | `{ success, data?, filename?, error? }` | Reads a save file from disk. |
| `deleteSave(gamePath, filename)` | `gamePath: string`, `filename: string` | `{ success, error? }` | Deletes a save file from disk. |

**`SaveEntry` object:**
```ts
{
  filename: string,   // e.g. "slot1.save"
  size: number,       // file size in bytes
  mtime: Date         // last modified date
}
```

---

### `window.illustratorAPI`

Exposed separately so it can be removed without affecting core functionality.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `ensureOutputDir(gamePath)` | `gamePath: string` | `{ success, dir?, error? }` | Creates the illustrations folder for the game if it doesn't exist. |
| `generatePrompt(sceneText)` | `sceneText: string` | `{ success, prompt?, error? }` | Sends scene text to Ollama and returns a Stable Diffusion prompt. |
| `queueComfyUI(params)` | `{ imagePrompt, outputFilename, checkpoint? }` | `{ success, promptId?, error? }` | Queues an image generation job in ComfyUI. Returns the job ID. |
| `pollImage(params)` | `{ promptId, outputDir }` | `{ success, pending?, dataUrl?, filename?, error? }` | Polls ComfyUI for job completion. Returns a base64 data URL when ready. |

**Polling pattern:** Call `pollImage` repeatedly (e.g., every 2–3 seconds) until `pending` is `false`. On success, `dataUrl` contains the image as `data:image/png;base64,...`.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | [Electron](https://www.electronjs.org/) (Node.js + Chromium) |
| Frontend | Vanilla HTML5, CSS3 (custom design system), ES6+ JavaScript |
| Game save storage | Native file system via Node.js `fs` |
| Library persistence | `localStorage` |
| AI prompt generation | [Ollama](https://ollama.com/) (`llama3.2`) |
| AI image generation | [ComfyUI](https://github.com/comfyanonymous/ComfyUI) + Stable Diffusion |
| Build tooling | [Electron Builder](https://www.electron.build/) |

---

## Planned / Future Work

The following improvements and platforms are on the roadmap:

- **macOS build** — a macOS version is planned once a Mac build environment is available.
- **Android / Quest 3 support** — a version targeting Android (APK) is desired, primarily to run Twine games on the Meta Quest 3 headset, but would benefit Android users in general.
- **Additional features** — the project follows a personal-use-first approach, with new features added as new needs arise.

---

## License

This project is licensed under the **ISC License**.
