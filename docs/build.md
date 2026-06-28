# Building Anvika

This guide covers building Anvika: the web client on its own, the standalone binary that
bundles the client and the server into one executable, how that binary applies database
migrations, how to run the server, and where it puts data and logs.

Anvika is run with [Bun](https://bun.sh). All build commands below assume Bun is installed and
that you have run `bun install` at the repository root.

## Web build

To build only the web client (a Vite production build):

```sh
bun run build:web
```

This runs the build for the `@anvika/web` workspace with the `--bun` flag, so Bun's own
runtime executes the build and no separate Node install is required. The output lands in
`apps/web/dist/`, with `index.html` and a hashed `assets/` directory.

You rarely need to run this on its own: the standalone-binary build runs it for you as the
first step of its prep.

## Standalone binary

The standalone binary is a single self-contained executable produced by `bun build --compile`.
It bundles the web client and the server together, so it boots on a machine with no source
tree and no separate web server: it serves the UI, persists data in SQLite, and applies its own
migrations.

To build the default binary:

```sh
bun run compile
```

The output is `dist/anvika` (`dist/anvika.exe` on Windows). `bun run build` is an alias for
`bun run compile`.

### The pipeline

`compile` runs two steps. The first is `compile:prep`, which builds the web client and then
generates an embed module:

1. `bun run build:web` produces `apps/web/dist/`.
2. `bun run generate:embed` runs `tooling/generate-embed.ts`, which walks `apps/web/dist/` and
   the migration files under `apps/server/drizzle/` and writes a generated module at
   `apps/server/src/generated/embedded.js`.

The generated module is plain JavaScript (not TypeScript). For every file in the web build it
emits an `import ... with { type: "file" }` statement, plus an exact map from each request URL
path (such as `/assets/index-<hash>.js`) to its embedded file. For the migrations it inlines
each migration's SQL together with its journal metadata. It fails loudly if the web build is
missing, so a stale or absent build can never yield a half-working binary.

The second step compiles the binary:

```sh
bun build --compile --minify apps/server/src/main.compiled.ts --outfile dist/anvika
```

Note the entry point: `bun build --compile` always targets `apps/server/src/main.compiled.ts`,
never `apps/server/src/main.ts`. There are two entrypoints by design. `main.ts` is the source
and development entrypoint: it serves the web client from the on-disk `apps/web/dist/`, runs the
on-disk Drizzle folder migrator, and resolves the data directory relative to the current working
directory. `main.compiled.ts` is the only file that imports the generated embed module: it
serves assets from the embedded manifest, runs the embedded migrations, and anchors the default
data directory next to the executable. Selecting the mode at compile time (by which entrypoint
is bundled) avoids any runtime "am I a binary" check.

### Types without committing the generated module

The generated `apps/server/src/generated/embedded.js` is gitignored, because it is regenerated
on every compile and its inputs (the web build and the migration outputs) are themselves
gitignored. Committing it would let it drift from the real build.

A hand-written declaration file, `apps/server/src/generated/embedded.d.ts`, is committed
alongside it. That declaration lets `tsc` resolve the import in a plain source checkout where
the `.js` is absent. Because the base TypeScript config sets `allowJs: false`, `tsc` never
typechecks the generated `.js`; it only reads the declaration. So a fresh clone typechecks
cleanly without ever running the codegen.

The principle is simple: a generated file is tracked in git if and only if its inputs are
tracked source files. The embed module's inputs are gitignored build outputs, so the module is
gitignored. By contrast, the TanStack Router route tree at `apps/web/src/routeTree.gen.ts` is
generated from tracked route source files, so it is committed.

### Build variants

The build is composed from two independent dimensions over the shared `compile:prep` step.

- Console window. By default the binary keeps a visible console window, so launching it from a
  terminal shows logs and `--help`, and closing the window stops the server. The
  `compile:windowless` variant adds `--windows-hide-console`, marking it a Windows GUI app with
  no console window, for double-click distribution to non-terminal users.
- Sourcemap. By default no sourcemap is produced. The `:debug` variants add
  `--sourcemap=external`, which writes an external `.js.map` sidecar (Bun cannot fold a
  sourcemap into a compiled executable). Keep that sidecar for any build you ship: a crash report
  carrying its `debugId` symbolicates offline against the map even when the recipient only has
  the bare executable.

The four resulting scripts are `compile` (console, no map; the default), `compile:debug`
(console, with map), `compile:windowless` (no console, no map), and `compile:windowless:debug`
(no console, with map).

A caution for the windowless variants: Anvika's primary audience is screen-reader users, and a
GUI-subsystem binary writes no output to a parent terminal, so a failed boot produces no
audible or readable feedback on screen, only a line in the log file the user would have to know
to open. The console-visible default is the safer hand-off, so the windowless variants are not
recommended for general distribution yet.

## Embedded migrations

The binary applies database migrations the same way the development server does, reusing
Drizzle's own migrator. Drizzle's folder migrator is two steps: read the migration `.sql` files
from disk, then call `db.dialect.migrate(...)` to apply and track them. The embedded runner
replaces only the first step. It reconstructs the same migration array from the embedded SQL and
journal metadata (splitting each migration on the statement breakpoint and hashing the raw SQL
with SHA-256), then calls Drizzle's own `db.dialect.migrate(...)`.

Because the tracking table, the per-migration hash, and the apply logic are all Drizzle's own,
a database created by the development folder migrator and one created by the binary are
byte-interchangeable, and the runner is idempotent on re-run.

In binary mode the default data directory anchors next to the executable rather than the
current working directory, so the SQLite database and logs land beside the binary wherever it is
launched from. The `--data-dir` flag and `ANVIKA_DATA_DIR` environment variable still override
this (see below).

## Running the server

The server is started through the `serve` command:

```sh
anvika serve --port <number> --data-dir <path> --no-open
```

All three options are optional:

- `--port` (`-p`): the TCP port to listen on. Defaults to 7800.
- `--data-dir` (`-d`): the application data directory. Defaults to `userdata` (next to the
  executable for the binary, or relative to the working directory for the development server).
- `--no-open`: do not open a browser on startup. By default the server opens one.

`serve` is the default command, so running the binary with no subcommand (for example
double-clicking it from a file manager) starts the server and opens the browser. `anvika serve`
remains the explicit equivalent.

For each setting the precedence is flag, then environment variable, then built-in default. The
port also reads `ANVIKA_PORT` and the data directory also reads `ANVIKA_DATA_DIR`. An invalid
port fails fast with a clear message rather than silently binding something else.

Anvika is a single-user application with no authentication. The server binds to loopback only;
it is not meant to be exposed on a network.

If the requested port is already in use, the behavior depends on whether the process is attached
to an interactive terminal. On a terminal, it asks whether to use the next free port (default
no) and exits if you decline. When not attached to a terminal (continuous integration, the
end-to-end test harness, or a detached launch), it fails fast instead of prompting, so
automation never hangs waiting for an answer that will not come.

## Where data and logs land

By default everything lives under `userdata/`. The location is chosen by precedence: the
`--data-dir` flag, then the `ANVIKA_DATA_DIR` environment variable, then the default. On
startup the directory and its `logs/` subdirectory are created if missing, and the directory is
checked for writability; if it is not writable, startup fails with a message naming the path and
pointing at `--data-dir`.

Logs are written per session rather than per day. Each server start writes a fresh file at:

```text
userdata/logs/<YYYY-MM-DD>/<HH-MM-SS>-<pid>.log
```

The date directory uses the local calendar date and the time stamp uses local wall-clock time
(colon-free so the name is valid on Windows); the process id suffix keeps two starts in the same
second from colliding. A self-contained per-session file reads cleanly top to bottom with a
screen reader. In addition, `userdata/logs/latest.log` is recreated on every start as a fixed
mirror of the current run, so there is always one stable path to open. Old date directories are
pruned on startup by a retention sweep.

Log entries never contain prompt or response text or API keys. Content logging is an explicit
development opt-in (`--log-content` or `ANVIKA_LOG_CONTENT`) and is off by default.

## Smoke test

After building the binary you can verify it end to end:

```sh
bun run smoke
```

This spawns the already-built binary from `dist/` (it does not build it) on an ephemeral port
with a temporary data directory, and checks that the health endpoint responds, the SPA index is
served, `GET /api/v1/settings` succeeds, and a nested embedded asset referenced by the index
resolves. It also launches the binary with no subcommand to prove the default-command path. The
binary is considered complete only when `bun run compile` and `bun run smoke` both pass.

`smoke` is kept out of `bun run verify` so the fast verification gate stays fast.
