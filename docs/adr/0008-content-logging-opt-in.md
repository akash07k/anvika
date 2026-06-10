# Content logging is an explicit, fail-safe opt-in

Anvika never logs prompt or response text by default. An operator may opt in to content
logging - logging the user and assistant message text - with the `--log-content` flag or the
`ANVIKA_LOG_CONTENT` environment variable. The `dev:server` command passes `--log-content`,
so development is on by default while production and public deployments stay off unless
explicitly enabled. API keys are never logged, in any mode.

Rationale: privacy-by-default protects shared and public deployments, but it also blinded the
operator developing the app on their own machine - the logs showed metadata and token counts
but never what was said. Content logging is the fix, gated so it can never be on by accident
where it would leak.

## Considered Options

- **No content logging (status quo):** rejected. It leaves the developer unable to see the
  messages they are debugging.
- **Default on unless an environment variable marks production:** rejected as fail-open. A
  public deployer who forgets the marker would leak message content. The default must be the
  safe one.
- **Default off; explicit opt-in; dev command opts in (chosen):** fail-safe. The default
  leaks nothing; enabling is always an explicit act.

## Consequences

- A new `logContent` boolean is resolved at boot (`--log-content` > `ANVIKA_LOG_CONTENT` >
  off) and injected into the chat path; when on, the route logs the latest user message text
  and `streamChat` logs the assistant response text, through an injectable content sink.
- A loud boot warning is emitted whenever content logging is on.
- The privacy rule in `AGENTS.md` and `docs/agents/conventions.md` is
  amended from "never log prompt/response text" to "never by default; explicit opt-in may
  enable it; never log API keys, ever".
- API keys remain absolutely excluded from logs in every mode.
