# Accessibility announcements go through an event-driven notification layer

Application code never calls the speech `announce()` primitive directly. Instead it emits a
semantic event (for example `generationStarted`, `messageCopied`, `settingsSaved`) to a small
central notifier, and output channels subscribe and render each event in their own medium. The
client ships with two channels: speech (`channels/speech.ts` holds the announcement table mapping
each event to its `{ message, priority }` and calls `announce()`, which is itself the single
ariaNotify-or-aria-live primitive, an internal detail) and a diagnostic log channel
(`channels/log.ts` forwards the event type to the server log). The notifier (`notify(event)` plus
`registerChannel(handler)`) is a deliberately minimal array of `(event) => void`, registered
once at startup - not a pub/sub framework.

Rationale: the design already mandates a single announce utility and an announcement table
mapping each event to a message and a priority. The owner has also asked
for audible earcons for the same events later (generation started, message sent, response
received, and more). Both wants are the same shape: the call site cares that "generation
started", not how that is rendered. Emitting an event and letting channels render it keeps the
wording and priority in one table, and makes the future audio-cue channel a new file plus one
`registerChannel` call with no change to any call site. It also makes the whole announcement
behavior testable without a real screen reader: a capture channel records emitted events for
assertions.

## Considered Options

- **Call `announce(message, priority)` directly at each site (simplest):** rejected. It is the
  fewest moving parts, but it scatters the exact wording and priority across many components,
  has no seam for a second output medium, and forces every future audio cue to revisit every
  call site. It also entangles component tests with announcement strings.
- **A full event-bus / pub-sub library:** rejected as over-built (YAGNI). A typed event union and
  an array of handler functions cover every current and near-future need; a framework adds
  dependency weight and indirection for no benefit at this scale.
- **Event union plus a minimal in-house notifier with registered channels (chosen):** one
  responsibility per file (event types, dispatch, the speech table, the speech primitive), open
  for new channels and events without modifying the notifier or call sites, and trivially
  testable. The cost is one layer of indirection between a call site and the spoken string.

## Consequences

- New modules under `apps/web/src/notifications/`: `events.ts` (the discriminated event union),
  `notifier.ts` (`notify` / `registerChannel` / a test reset), `channels/speech.ts` (the
  announcement table calling `announce()`), `channels/log.ts` (the diagnostic server-log channel),
  and `announce.ts` (the ariaNotify-or-aria-live primitive). Channels are registered once at app
  startup.
- Adding the planned audio-cue channel later is `channels/audioCue.ts` plus one
  `registerChannel(audioCueChannel)` call; no call site changes. Progressive per-sentence
  announcement, also deferred, slots in as a new event variant and table entries.
- Settings-save feedback, copy confirmations, the streaming heartbeat, errors, and quick-nav
  reads all become event emissions; the settings store and components stop owning announcement
  strings. The interim one-off `aria-live` regions in the chat and settings views are removed in
  favor of the notifier.
- Logging is a channel, not a notifier responsibility. The notifier itself neither speaks nor logs;
  a dedicated diagnostic log channel (`channels/log.ts`) forwards each notification to the server
  log as an allow-listed event-type code via the existing `POST /api/v1/log` boundary, so an
  operator can trace which announcements fired. Only the fixed event-type code crosses the boundary -
  never an event payload - so response or error text cannot leak (never-log-content holds). The
  periodic `generationProgress` event is deliberately not forwarded: it ticks every couple of seconds
  and would flood the screen-reader-navigable log, and its window is already bracketed by the
  started/complete codes. (Revised in implementation; the original draft assumed an
  `anvika.client.announce` browser LogTape category that does not exist.)
- Component tests assert behavior through a capture channel and an announce mock rather than the
  DOM; the announce primitive's two paths are tested directly in Vitest Browser Mode (ADR 0002).
