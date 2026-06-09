# Logging standard

The single source of truth for how Anvika logs, for both the server and the client. New
subsystems and new use-cases follow this; the `AGENTS.md` "diagnostic logging coverage" review
dimension enforces it as part of the quality bar for every change.

## Why logging is first-class

A default `info` run must tell the story of what the app did; a `debug` run adds the firehose.
Logging is content-safe by construction: structured fields carry ids, counts, durations, enums,
and booleans only - never prompt/response text or secrets, and never an API key.

## Category taxonomy

One category per subsystem, under one of two roots:

- Server: `anvika.server.{boot,http,chat,models,persistence,settings,conversation,process}`.
- Client: `anvika.client.{keyboard,focus,error,...}`.

A new subsystem adds a category; categories map one-to-one to the per-category verbosity knobs
(`--log-category <cat>=<level>` / `ANVIKA_LOG_CATEGORIES`). Get a server logger with
`serverLogger('persistence')`; client events resolve their category from the registry.

## Level guidance (two tiers)

- `info` - meaningful outcomes (a conversation loaded, settings saved, a turn finished).
- `debug` / `trace` - fine, high-frequency detail (per-keystroke traces, per-chunk progress).
- `warning` - recoverable problems (a request that succeeded after a retry, a soft miss).
- `error` - failures (a store op threw, an HTTP request 500'd).
- `fatal` - unrecoverable conditions (an uncaught exception). When logging is on, `fatal` emits
  through the normal sinks; when logging is `off`, it does not (see below) - crash visibility is
  guaranteed by a separate always-on channel, not by the level filter.

## The `off` threshold

`off` is a config value of the level (and of any per-category override), not an event severity.
It means "emit nothing at all" - including `fatal` - matching the dominant industry convention
(Log4j `OFF`, .NET `LogLevel.None`, Pino `silent`, Rust `LevelFilter::OFF`). It works globally
(`--log-level off` / `ANVIKA_LOG_LEVEL=off`) and per-category (`--log-category persistence=off`).
When globally off, the client also stops producing diagnostic POSTs (it sends one content-safe
batch, learns off from the response, then goes silent).

"The app can never die silently" is upheld WITHOUT exempting fatal from `off`: the global error
sinks report a crash on an always-on channel that the level filter cannot mute. On an uncaught
exception the server writes the error (and stack) to stderr and exits non-zero, so the shell, CI,
or process supervisor sees the failure even at `--log-level off`. This is the conventional
separation - the log *level* governs routine verbosity; *death* is reported by exit code + stderr.

## Content-safe field rules

Structured fields are scalars / ids / counts / durations / enums / booleans only. Never log:

- prompt or response text, message bodies, or any user content;
- API keys, tokens, or other secrets.

The `--log-content` / `ANVIKA_LOG_CONTENT` opt-in (ADR 0008) is the sole, orthogonal exception,
default off and intended for local development only. API keys are never logged, ever.

## How each side logs

- Server (in-process, no trust boundary): idiomatic
  `serverLogger(category).info('outcome message', { id, count, durationMs })`. TypeScript types
  the fields; there is no second typed union. The cross-cutting seams (the persistence-store
  decorator, the global error sinks, the HTTP request middleware, and the Hono `onError` handler)
  log by default so persistence and unhandled errors are automatic and unbypassable.
- Client (data crosses HTTP, so content-safety is structural): a typed `DiagnosticEvent` variant
  forwarded over `POST /api/v1/log`. Add a new `strictObject` variant (named scalar fields only)
  in `packages/shared/src/diagnostics/events.ts` and its `{ category, level, message }` in
  `registry.ts`; emit it with `logDiag({ type: '...', ... })`.

## The file layout

Logs land in `userdata/logs/{YYYY-MM-DD}/{HH-MM-SS}-{pid}.log` - a date directory with one
self-contained file per server start (per session), easy to read top-to-bottom with a screen
reader. A fixed `userdata/logs/latest.log` is recreated each start and mirrors the current
session. The startup sweep deletes whole date directories older than the retention window;
`latest.log` is never swept.
