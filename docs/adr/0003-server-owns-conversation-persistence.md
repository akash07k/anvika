# The server is the sole writer of the conversation, at end of stream

With a single persisted conversation, the server persists it; the client never writes it. During a `POST /api/v1/chat` request the server holds the incoming `UIMessage[]` (which includes the new user message) in memory and writes the conversation exactly once when the stream terminates, choosing what to write by how it ended:

- **Success (`onFinish`)**: upsert the full turn - the incoming messages plus the generated assistant message.
- **Provider or stream error (`onError`)**: upsert the incoming messages only - the user message is preserved, no assistant message. The turn is retryable after reload, and a partial assistant response is never restored (honouring "a restored conversation never renders in a broken state").
- **User Stop (`onAbort`)**: no write - the turn is discarded and the prior conversation is left intact.

Because `onFinish` does not fire on abort while `onAbort` does, the server distinguishes a deliberate Stop from an involuntary error and treats them differently: Stop discards, error preserves. Writing only in the terminal callback means no up-front write and therefore no rollback.

The conversation is stored as the AI SDK `UIMessage[]` in a single JSON column under `owner = local`; the single-row upsert is atomic. The client only `GET`s the conversation on load to hydrate `useChat`.

This is the API-first choice (the server owns persistence; the client stays thin), it is the AI SDK's documented message-persistence pattern, it is durable against client death, and it needs no extra round-trip.

## Considered Options

- **Client saves on completion** (`PUT` after `onFinish`): rejected. A thin client owning a core responsibility cuts against API-first, and a crash or tab-close before the `PUT` loses the turn.
- **Both** (server authoritative plus a client `PUT` backstop): rejected. Two writers on one row invite races and conflict logic for no benefit.
- **Preserve the user message on Stop too** (Stop behaves like error): considered for robustness, rejected. Stop is a deliberate cancel; a dangling unanswered message reappearing after reload reads as a failure. Accidental-Stop text loss is better mitigated in-session (the composer can retain text) than by persisting across reloads.

## Consequences

- `PUT /api/v1/conversation` stays in the contract but is unused by the single-conversation client; it is reserved for client-driven edits and branching once multi-conversation management lands.
- Spec section 8 step 6 ("the client saves the updated conversation with `PUT`") is superseded: the server saves at end of stream.
- A deliberately Stopped turn is not recoverable after reload (accepted); an errored turn's user message is.
