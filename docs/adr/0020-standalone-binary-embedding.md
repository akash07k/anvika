# Standalone binary embedding: two compile-time entrypoints, embedded assets and migrations, executable-anchored data dir

Ship a `bun build --compile` standalone executable using two separate server entrypoints
selected at compile time - one for source/dev, one for binary - with the web UI embedded via
a build-generated codegen manifest, database migrations rebuilt from embedded SQL, and the
default data directory anchored next to the executable.

## Rationale

- The distribution model names a single Bun binary as the shipping artifact. Three
  things break when `bun build --compile` is run against the unmodified server: the web UI is
  served from an on-disk path that does not exist in the binary, Drizzle's folder migrator reads
  `.sql` files from an on-disk path that does not exist in the binary, and `userdata/` is
  resolved relative to the current working directory rather than the executable, scattering data
  wherever the user runs it from.
- Making the binary robust requires replacing all three file-reading seams with embedded
  equivalents without disturbing the source and dev workflow at all.

## How it works

### Compile-time mode selection (two entrypoints, no runtime sniffing)

The binary/source difference is resolved by which entrypoint `bun build --compile` bundles,
not by any runtime check. Both entrypoints call the same shared `startServer(cfg, deps)` after
constructing three mode-specific dependencies (`assetSource`, `migrate`, `defaultDataDir`).

- `apps/server/src/main.ts` is the source and dev entrypoint. It constructs a
  `FilesystemAssetSource` (on-disk dist), passes the Drizzle folder migrator, and uses the
  cwd-relative `userdata/` default. This file and its behavior are unchanged.
- `apps/server/src/main.compiled.ts` is the compile entrypoint. It is the only file that
  imports the generated embedded module. It constructs an `EmbeddedAssetSource` (manifest
  lookup), passes the embedded migrations runner, and uses `join(dirname(process.execPath),
  "userdata")` as the default data dir. `bun build --compile` targets this file.

Dev and CI typecheck never import the generated module, so its absence in a source checkout
cannot break the dev workflow or `tsc`.

### Asset source port

An `AssetSource` port (`resolve(urlPath): Promise<Response | null>`) has two implementations:

- `FilesystemAssetSource`: maps the URL path to a file under the on-disk dist, guards against
  path traversal, and falls back to `index.html` for SPA routes. Used in source/dev mode.
- `EmbeddedAssetSource`: looks up the URL path in the generated `WEB_ASSETS` manifest (whose
  values are `Bun.file`-readable virtual paths); no `.exists()` guard (embedded files always
  exist); falls back to the embedded `index.html` for SPA routes. Used in binary mode.

`createApp` accepts an `AssetSource` instead of a raw `webDistDir` string, removing all
filesystem-specific branching from `app.ts`.

### Embed codegen

A build script (`tooling/generate-embed.ts`) runs after the Vite web build and before
`bun build --compile`:

- Recursively walks `apps/web/dist/` and emits one `import aN from '<absolute path>' with
  { type: "file" }` statement per file, plus an exported `WEB_ASSETS: Record<string, string>`
  mapping each canonical URL path (for example `/assets/index-<hash>.js`) to its imported
  reference. The mapping is exact and constructed from the actual built files, no hash-guessing
  or filename regex.
- Does the same for the migration `.sql` files and `_journal.json`, producing an ordered
  `MIGRATIONS` structure the embedded runner consumes.
- Writes the result to `apps/server/src/generated/embedded.js` (plain JS, not `.ts`). This
  file is gitignored and regenerated on every compile so it cannot drift.
- A hand-written `apps/server/src/generated/embedded.d.ts` is committed alongside, declaring
  the shapes of `WEB_ASSETS` and `MIGRATIONS`. Because the project base tsconfig has
  `allowJs: false`, `tsc` never typechecks the generated `.js`; it only resolves the declaration
  file. The bundler embeds the real `.js` at compile time; `tsc` in a source checkout resolves
  the `.d.ts` for type safety.
- Fails loudly if `apps/web/dist/index.html` is absent, so a missing or stale web build can
  never produce a silent or partial binary.

The consistent principle: a generated file is tracked in git if and only if its inputs are
tracked source files. The generated embed module's inputs are the gitignored `apps/web/dist/`
and `drizzle/` migration outputs, so the module itself is gitignored.

### Embedded migrations runner

`drizzle-orm/bun-sqlite`'s `migrate(db, config)` is `readMigrationFiles(config.migrationsFolder)`
followed by `db.dialect.migrate(migrations, db.session, config)`. The embedded runner replaces
only the file-reading step: it reconstructs the same `migrations` array (`{ sql: query.split("--> statement-breakpoint"), bps, folderMillis, hash: sha256(raw sql) }`) from the embedded SQL strings and journal metadata, then calls Drizzle's own
`db.dialect.migrate(migrations, db.session, config)`.

The migration-tracking table (`__drizzle_migrations`), the per-migration SHA-256 hash, and the
apply logic are therefore byte-identical between the dev folder migrator and the binary embedded
runner. A database created by one is fully interchangeable with a database opened by the other;
the runner is idempotent on re-run. A test verifies this by running both paths against the real
`drizzle/` folder and comparing the resulting `__drizzle_migrations` hash set and table set.
Because the SHA-256 is taken over the raw SQL bytes, the migration `.sql` files are forced to
LF via `.gitattributes` (`*.sql text eol=lf`) so the hash is identical on every platform and
git autocrlf setting; otherwise a CRLF checkout would change the hash and could re-run
already-applied migrations once cross-compiled binaries run against a database created on a
different OS.
`db.dialect` and `db.session` are accessed through a minimal typed shim without `any` or
non-null assertions.

### Default data-dir anchor

`resolveDataDir` already accepts a `defaultDir` parameter. Each entrypoint supplies it:

- `main.compiled.ts` passes `join(dirname(process.execPath), "userdata")`, anchoring data next
  to the executable regardless of the working directory.
- `main.ts` passes the existing cwd-relative `"userdata"`.

The `--data-dir` flag and `ANVIKA_DATA_DIR` environment variable still override both with
unchanged precedence.

### Build and verification scripts

- The build is composed from two independent dimensions, each a `bun build` flag, over a shared
  `compile:prep` step (`build:web` then `generate-embed`). All variants target
  `main.compiled.ts` and write `dist/anvika.exe`.
  - Console dimension: by default the binary keeps a visible console window (a console-subsystem
    executable), so launching it from a terminal shows logs and `--help`, and closing the
    window stops the server. Adding `--windows-hide-console` marks it a Windows GUI app with no
    console window, for double-click distribution to non-terminal users.
  - Sourcemap dimension: by default no sourcemap is produced (a single `.exe`). Adding
    `--sourcemap=external` also writes a `dist/main.compiled.js.map` stamped with a matching
    `debugId`. Bun cannot fold a sourcemap into a compiled executable: every `--sourcemap` mode
    writes an external `.js.map` sidecar and leaves the executable size unchanged, and passing
    the flag in any mode (even `none`) produces the sidecar, so the lean builds omit it. Keep
    the `.js.map` for any build you ship; a crash report carrying the `debugId` symbolicates
    offline against the kept map, even when the recipient only had the bare `.exe`.
- The four resulting scripts: `compile` (console, no map; the default), `compile:debug`
  (console, map), `compile:windowless` (no console, no map), and `compile:windowless:debug`
  (no console, map). `bun run build` aliases `compile`.
- `bun run smoke` (`tooling/smoke-binary.ts`): spawns the pre-built binary from `dist/` (it does
  not build it) on an ephemeral port with a temp data dir, asserts that `/health` returns 200,
  the SPA root returns the embedded `index.html`, `GET /api/v1/settings` succeeds, and a nested
  embedded asset (e.g. `/assets/index-<hash>.js`) is served correctly. It also launches the
  binary with no subcommand to prove the default-command (`serve`) path, then kills the
  processes.
- `bun run smoke` is kept outside `bun run verify` so the fast gate stays fast. The binary is
  considered complete only when `bun run compile && bun run smoke` both pass.

## Considered Options

- **Runtime mode detection** (`process.isBun`, presence of a sentinel file, etc.): rejected.
  A single entrypoint that branches at runtime on "am I a binary" is fragile and branchy; it
  means the embedded path runs only when the binary is present and the filesystem path runs
  otherwise, so a mis-detected mode silently serves the wrong thing. Two clean compile-time
  entrypoints eliminate the heuristic entirely.
- **Glob-embed with runtime hash-stripping of asset names**: rejected. Glob patterns on
  filename hashes are fragile (the hash in `index-<hash>.js` is not a stable string), and a
  runtime strip of the hash to recover the canonical URL path would be both fragile and
  inverted. An exact codegen manifest maps each URL path to its embedded file directly and
  needs no runtime pattern matching.
- **Ship an embedded seed SQLite database**: rejected. A bundled seed DB would drift from the
  schema on every migration. Running real Drizzle migrations on first boot against an empty
  database (the same path the dev server already takes) is simpler and always correct.
- **`--bytecode` flag**: rejected. Bytecode compilation only speeds startup, which a
  boot-once server does not benefit from. It inflates binary size and is the less battle-tested
  `bun build` path. The flag is a one-line change to add later if startup latency ever matters.
- **Generate a `.ts` module excluded via `tsconfig`**: rejected. Even with an `exclude` entry,
  `tsc` pulls imported files into the program through `import` statements; the compile entrypoint
  imports the generated module, so `tsc` would still try to typecheck it and choke on the
  bundler-only `with { type: "file" }` import attributes. Using a `.js` output with a committed
  `.d.ts` satisfies the bundler (it embeds the `.js`), `tsc` (it resolves the `.d.ts`), and the
  dev checkout (neither file is loaded at runtime, and `tsc` never typechecks the generated
  `.js` because `allowJs: false`).

## Consequences

- A single self-contained `dist/anvika.exe` (approximately 107 MB on Windows) boots on
  a fresh machine with no source tree, serving the web UI, persisting data in SQLite, and
  applying migrations on first run and on upgrade.
- `serve` is the default command (Commander `isDefault: true`), so running the binary with no
  arguments (for example double-clicking `anvika.exe` from a file manager) starts the server
  and opens the browser. `anvika.exe serve` remains equivalent and explicit, and `--help`
  still prints usage. This makes the bare executable usable by non-terminal users.
- The default `compile` build keeps a visible console window, so a terminal launch shows logs
  and closing the window stops the server. The `compile:windowless` and `compile:windowless:debug`
  variants opt into `--windows-hide-console` for double-click distribution. Hiding the console
  has two tradeoffs: a GUI-subsystem binary does not write to a parent terminal (its logs and
  `--help` are invisible from a shell; startup failures surface only in the `userdata/` log
  file, not on screen), and there is no console to close to stop the background server. A proper
  error-surface and stop affordance is the deferred desktop wrapper. Because Anvika's
  primary audience is screen-reader users, the windowless variants are therefore not recommended
  for general distribution until that wrapper exists: a failed boot produces no audible or
  readable feedback, only a log file the user must know to open. The console-visible default is
  the safer hand-off for now.
- The large binary size is driven primarily by the web bundle embedding the full Shiki/highlight
  syntax-highlighting grammar set. Trimming the language set is deferred.
- `bun run verify` does NOT build or run the binary, keeping the fast gate fast.
  `bun run compile && bun run smoke` is what verifies the binary is complete.
- Host target is Windows for now. Cross-compilation to macOS and Linux and CI/release
  packaging are deferred.
- The `--data-dir` flag and `ANVIKA_DATA_DIR` env continue to override the default with
  unchanged precedence. Operators who use a custom data dir outside the project root are
  responsible for keeping it out of version control; `secrets.json` in that directory holds
  plaintext API keys (ADR 0019).
- Content-safe outcome logs cover the new boot paths: which asset source and migration strategy
  were selected (binary vs. source), the resolved data directory, and the number of migrations
  applied by the embedded runner. No file contents, settings values, or secrets cross a log
  boundary.
