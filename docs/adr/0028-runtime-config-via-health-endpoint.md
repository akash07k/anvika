# Operator runtime config reaches the client via the health endpoint

The web client needs to know certain operator/runtime flags to gate its own behavior. The first is
the content-logging state (`logContent`): the notification log channel only attaches content text to
diagnostic logs when the operator has opted in. These flags are operator/runtime configuration, not
user settings, and they are not sensitive. Anvika delivers them on `GET /api/v1/health`, which already
carries server runtime metadata (the app version), and the client reads them once at boot into a
small runtime-config store.

Rationale: the gate that decides whether response or error text rides a diagnostic log must not depend
on user-settings hydration being healthy, and it must not conflate operator config with user
settings. The health endpoint is the server's runtime-status surface, so a runtime flag belongs there,
beside `version`. Reading it once at boot, defaulting to the safe value (`false`) until the fetch
resolves, keeps the content-safe floor in force during early boot.

## Considered Options

- **On the settings response, beside `paths` (rejected):** the settings response already carries some
  runtime metadata, so it was the smallest change. Rejected because it conflates operator/runtime
  config with user settings and couples the diagnostics gate to settings hydration succeeding. A
  degraded settings load must not decide whether content logging is on.
- **A dedicated `GET /api/v1/config` endpoint (rejected for now):** the most "correct" home for a
  growing set of runtime flags, but YAGNI for a single boolean. `version` already set the precedent
  that health carries server metadata. Revisit if the runtime-flag set grows enough to warrant its own
  surface.
- **On the health endpoint, into a client runtime-config store (chosen):** health already returns
  server runtime metadata; the flag sits beside `version`; it is available independently of settings;
  one boot fetch populates a small Zustand store the diagnostics layer reads.

## Consequences

- `HealthResponseSchema` gains `logContent: boolean` (required). The health route becomes a factory
  `createHealthRoute({ logContent })`, matching every other route factory, and `createApp` threads
  `cfg.logContent` into it.
- The client fetches `GET /api/v1/health` once at boot into a runtime-config Zustand store, defaulting
  to `false` until resolved, so any event before the fetch completes is logged content-free.
- Future operator/runtime flags follow this path. The planned live diagnostics-verbosity toggle
  is the next expected consumer; if the set grows, promote it to a dedicated
  config endpoint then.
- The health response now exposes `logContent` to any client. This is acceptable for the single-user,
  local app and the flag is not sensitive. A future public or multi-user surface should reconsider
  exposing operator config on an unauthenticated endpoint; this is noted on the multi-owner deferred
  item.
