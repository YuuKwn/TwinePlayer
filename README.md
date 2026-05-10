# Twine Player

Twine Player is a standalone Electron app for playing Twine HTML games outside your regular browser profile. The initial implementation plan is complete: the app now has a modular main process, extracted renderer/game modules, hardened IPC boundaries, a local save system, a searchable game library, optional AI illustration tools, CI checks, and packaged build targets.

It keeps a local game library, stores saves as files next to each game, includes an in-game developer console, and provides an optional AI Illustrator panel for generating scene images through local services.

## Features

- Game library with metadata extraction, search, sort, missing-file detection, and relink support.
- Dedicated player window for Twine `.html` and `.htm` games.
- Native save manager with paginated save/load/delete controls.
- Async, atomic save writes into `<game>_saves/` folders with filename validation and stale temp cleanup.
- In-game developer console with autocomplete and per-game saved commands.
- Configurable AI Illustrator with Ollama or OpenAI-compatible text backends plus ComfyUI image generation, local image copies, and metadata sidecars.
- Hardened renderer/main IPC boundaries and CSP.
- Windows CI workflow that runs syntax checks and the Node test suite.

## Run From Source

```bash
npm install
npm start
```

## Check

```bash
npm run check
```

This runs JavaScript syntax checks for the Electron entry points and extracted modules, then runs the Node test suite under `test/`.

## Build

```bash
npm run build:win
npm run build:win:portable
npm run build:linux
npm run build:all
```

Build outputs are written to `dist/`.

## AI Illustrator

The Illustrator feature is optional.

Text backend options:
- Ollama at `http://localhost:11434`
- OpenAI-compatible local servers, such as llama.cpp or MLX/oMLX, using an endpoint that includes `/v1`, for example `http://192.168.1.20:8080/v1`

Image backend:
- ComfyUI at `http://localhost:8188` by default

All Illustrator endpoints and generation settings are configurable in the Illustrator panel.

## Documentation

See [docs/documentation.md](docs/documentation.md) for architecture, setup notes, IPC references, testing, troubleshooting, and release guidance. See [docs/remaining-phases-handoff.md](docs/remaining-phases-handoff.md) for the completed implementation-plan history and the current release-readiness handoff.

## License

ISC
