# Logging is a first-class foundation: a standard, structural seams, a true off switch, per-session files

After the diagnostic logging tier (ADR 0016) shipped the content-safe diagnostic capability,
logging across the rest of the app was uneven and mostly error-focused. Whole layers were thin or
silent, there was no mechanism to guarantee new code logs, no global off switch, and a single daily
log file that was hard to read top-to-bottom with a screen reader. This foundation, the first step of
the app-wide logging effort, makes diagnostic logging a first-class, never-silently-forgotten,
configurable citizen. The standard is at `docs/agents/logging.md`.

The shape: a single logging standard (category taxonomy, two-tier level guidance - `info` for
outcomes, `debug`/`trace` for detail, `warning`/`error`/`fatal` for problems - and content-safe field
rules); structural "log by default" seams so coverage is automatic, not remembered; a global off
switch as a config-only threshold; and per-session log files that read cleanly with a screen reader.
The server keeps its idiomatic `serverLogger(category).level(message, fields)` convention (in-process,
TypeScript types the fields - no second typed union); the client keeps its typed `DiagnosticEvent`
union over `POST /api/v1/log` because its data crosses HTTP, gaining one content-safe `clientError`
variant.

## Considered Options

- **Leave logging as a per-call discipline:** rejected. Relying on each author to remember a log line
  is exactly what produced the thin, error-only coverage. Whole layers stayed silent because nothing
  structural forced an outcome log.
- **Define `off` as "off except fatal" (a fatal floor):** rejected. It seems safer -
  "the app can never die silently" - but it diverges from every major framework (Log4j `OFF`, .NET
  `LogLevel.None`, Pino `silent`, Rust `LevelFilter::OFF`, Go zerolog `Disabled`), all of which mean
  truly off. Conflating "verbosity is off" with "crashes still print" overloads the level filter with
  a responsibility that belongs to the process exit channel.
- **A true off switch with crash visibility moved out-of-band (chosen):** `off` means TRULY off,
  fatal included; crash visibility is guaranteed by an always-on stderr + non-zero-exit channel the
  level filter cannot mute. The log *level* governs routine verbosity; *death* is reported by exit
  code and stderr - the conventional separation.

## Consequences

- Three-layer enforcement. (1) Structural seams that log by default: a persistence-store decorator
  (`withConversationStoreLogging` / `withSettingsStoreLogging`) and global error/rejection sinks on
  both server (`installProcessErrorHandlers`) and client (`installWindowErrorHandlers`). (2) A process
  gate: a mandatory "diagnostic logging coverage" review check plus a definition-of-done
  bullet in `AGENTS.md`. (3) A tested contract: the reusable `captureServerLogs()` buffer-sink helper
  and the established client `logDiag` spy, so feature tests assert their key events and forgetting
  logging fails CI.
- The global off switch is a config-only threshold: `LogThreshold = LogLevel | 'off'`, accepted
  globally (`--log-level off` / `ANVIKA_LOG_LEVEL=off`) and per-category (`--log-category <cat>=off`).
  `buildLoggers` maps an off scope to `{ sinks: [], parentSinks: 'override' }` - LogTape sinks inherit
  from ancestor loggers unless overridden, so emptying them needs the override (verified via Context7).
  The event severity types stay `trace..fatal`; `off` is never an event level.
- Crash visibility survives `off` out-of-band: the global error sinks write a crash to stderr and
  exit non-zero, which the shell, CI, or process supervisor sees even at `--log-level off`. On an
  uncaught exception the server logs `fatal`, writes the stack to stderr, and exits 1 (an uncaught
  exception leaves the process undefined - the conventional response is to crash). An unhandled
  rejection logs `error` and writes to stderr but does not exit (a stray rejection must not kill a
  local single-user server).
- The client honors off end-to-end. When globally off, the server's `/api/v1/log` 204 carries
  `x-anvika-diagnostics: off`; the transport classifies that as a `'disabled'` result, and the batcher
  clears its queue and goes no-op - so after a single content-safe POST the client stops POSTing.
- Per-session log files plus a latest pointer: `userdata/logs/{YYYY-MM-DD}/{HH-MM-SS}-{pid}.log`
  (a self-contained file per server start, easy to read with a screen reader) and a fixed
  `userdata/logs/latest.log` recreated each start. The startup sweep deletes whole date directories
  older than the retention window and never sweeps `latest.log`. The `--watch` restarts scatter files
  under today's date dir, accepted and auto-pruned by retention (KISS, no dev/prod split).
- New use-cases get coverage by default (persistence and unhandled errors) or by the gate + tests;
  removing or forgetting a log fails review or CI. Operators can turn diagnostics entirely off, end to
  end, at launch time; the live in-app toggle remains a later follow-up this foundation seeds. The
  per-layer coverage sweeps (model, chat orchestration, conversation, remaining client flows) ride
  this foundation as separate later efforts.
