# Diagnostic logging is a single batched, typed, content-safe client endpoint

Client-side diagnostics (keyboard, navigation, focus, and later other subsystems) are forwarded to
the server over ONE logging endpoint: `POST /api/v1/log`, evolved from the original strict
`{ level, event }` single code to a batched typed union `{ entries: DiagnosticEntry[] }`. Each entry
is a content-safe envelope (`seq`, `at`) plus a typed variant with only named scalar fields; the
existing milestone codes fold into the same union as a `milestone` variant, so the notification log
channel becomes a producer into the one batched transport rather than a second endpoint. Diagnostics
are content-safe by default and split two-tier: each action's outcome logs at `info`, the
per-keystroke trace at `debug`.

Rationale: the empty-message-id quick-nav bug had to be diagnosed from a database dump because the
logs recorded only a milestone code, never the key, slot, target id, or focus outcome. The fix is
structured metadata in the log. It must stay content-safe by default (the app is going public and a
log is the artifact a user shares to get help), and it must not perturb the UI it observes. Server
code logs in-process and needs no endpoint, so the only client logging endpoint is this one;
future instrumentation adds variants, never endpoints.

## Considered Options

- **Keep the strict single-code endpoint and add a second `/api/v1/log/diag`:** rejected. It works,
  but it sets a precedent of one endpoint per logging concern and splits the client logging contract
  in two for no benefit, since server logging needs no endpoint at all.
- **One generic constrained envelope (`{ category, code, level, fields: Record<key, scalar> }`):**
  rejected. Less ceremony, but safety becomes a field-level discipline (key allow-list plus value
  caps) instead of a structural property, the `fields` type is a loose record, and it is easier to
  pass something content-ish by accident. For an app whose hard rule is "never log content,"
  structural safety wins.
- **Browser-only LogTape sink, no forwarding:** rejected. No boundary or schema, but it defeats the
  requirement that everything be readable in the one screen-reader-navigable server log file.
- **One batched typed union on a single evolved endpoint (chosen):** end-to-end types, structural
  content-safety (no free-form field anywhere), no endpoint sprawl, and batching that also benefits
  the milestone codes. The cost is one schema entry per new event type - the discipline that keeps it
  safe - and a one-time evolution of the existing route and client logger.

## Consequences

- New shared modules under `packages/shared/src/diagnostics/`: the entry envelope and `DiagnosticEvent`
  union with per-event strict Zod schemas, and a registry mapping each variant to its category, level,
  and message. Client and server validate against the same source of truth.
- New client modules under `apps/web/src/diagnostics/`: `logDiag` (envelope stamping), a bounded
  batcher (flush on size, timer, and `pagehide` keepalive; drop-oldest with a self-reported
  `logsDropped`; retry on transient failure; no-retry plus a single `logTransportError` on a poison
  400), and a transport that never throws into the UI. `clientLog` becomes a thin producer of
  `milestone` entries through the same batcher.
- `POST /api/v1/log` evolves to validate a bounded batch and write each entry at its category and
  level; an invalid or oversized batch is rejected whole with the `{ code, message, details }` error
  contract and nothing is written.
- The notification log channel drops only the overlapping `quickNavRead` code (the richer diagnostic
  line replaces it); speech and every other notification code are unchanged.
- Focus outcome is logged from `messageFocus` (where it is actually known, after the deferred focus),
  not from the hotkey call site; the quick-nav press handler moves into a small navigation module so
  `useChatHotkeys` stays a binding file under the size cap.
- Verbosity is configured at launch: `--log-level` / `ANVIKA_LOG_LEVEL` and repeatable
  `--log-category <cat>=<level>` / `ANVIKA_LOG_CATEGORIES`, precedence flag > env > default (`info`;
  `dev:server` raises to `debug`), failing fast on bad input. `configureLogging` gains a per-category
  level map. A live in-app verbosity toggle is a committed follow-up.
- Content logging is unchanged: it remains the orthogonal `--log-content` opt-in (ADR 0008), default
  off; this tier never logs prompt/response text or API keys.
