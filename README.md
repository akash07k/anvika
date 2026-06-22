# Anvika

Anvika is an accessible AI application (a Jan or OpenWebUI class app) built for screen-reader and
keyboard users. It is an orchestration layer over AI models: it connects to cloud providers and to
your own already-running local server, but it does not run, host, or serve models itself. Anvika
orchestrates models; it is not an inference engine.

Chat is the first surface. The longer-term aim is a full accessible AI application (custom
assistants, skills, tools and MCP, retrieval, voice, and more), always with screen-reader and
keyboard users first.

## Requirements

- Bun (the only runtime). Install it from <https://bun.sh>.
- Git, only if you want the launcher to update the source for you.

Node.js is NOT required. The server and the standalone binary run entirely on Bun, and Bun provides
the `node:*` built-in modules the code imports. The build and test tooling (vite, tsc, vitest, and
so on) are JavaScript CLIs, and on Windows their `node_modules\.bin` shims call `node` by default,
which is why a machine without Node.js could fail to build. The launcher and the commands below
avoid that by forcing Bun with `bun --bun`, so only Bun (and Git for updates) is needed.

## Quick start on Windows

Double-click `launcher.bat` in the project root. It opens an interactive menu:

1. Launch the app.
2. Launch the app windowless (no console window; it opens in your browser).
3. Update from source (git pull origin main).
4. Install or update dependencies (bun install).
5. Build the web client.
6. Build the standalone binary.
7. Open the app in the browser.
8. Stop the app.

On startup it also asks whether to pull the latest source first. The app opens at
<http://127.0.0.1:7800>; to use a different port, run it manually with `--port` (see below).

## Quick start anywhere (manual)

```sh
bun install
# Build the web client (forces Bun, so no Node.js is needed):
bun run build:web
# Start the server (opens your browser at http://127.0.0.1:7800):
bun run serve
```

Use `bun run serve --no-open` to skip opening the browser, `--port <number>` to change the port, and
`--data-dir <path>` to choose where the SQLite database and logs live (they default to a `userdata`
folder in the project root).

## Standalone binary

`bun run compile` builds a single self-contained executable into `dist/`. That binary needs neither
Bun nor Node.js to run, which is the most portable way to distribute the app.

## Learn more

- Architecture and the accessibility model: [ARCHITECTURE.md](ARCHITECTURE.md)
- Where the project is heading: [ROADMAP.md](ROADMAP.md)
- How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md)
- Glossary of project terms: [CONTEXT.md](CONTEXT.md)
- Architecture decision records: [docs/adr/](docs/adr/)
- Design research notes (why Anvika does things its way): [docs/research/](docs/research/)
- Local development and the AI SDK gotchas: [docs/development.md](docs/development.md)
- Testing and the verify gate: [docs/testing.md](docs/testing.md)
- Building and the binary pipeline: [docs/build.md](docs/build.md)
- Releasing and distribution: [docs/release.md](docs/release.md)
