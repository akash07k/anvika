# The AI SDK lives behind a single orchestration seam

The server touches the AI SDK's streaming API (`streamText`, `toUIMessageStreamResponse`) in
exactly one module - `streamChat`. That module returns a Web `Response` and exposes only domain
types outward: the conversation as `UIMessage[]`, and a `ChatTurnOutcome` (`{ status:
'completed' | 'aborted' | 'error'; finalMessages: UIMessage[]; incomingMessages: UIMessage[] }`)
that it maps the SDK's finish signals into. `streamChat` carries no save policy: it only maps
the SDK signals to a `status` and carries both message lists (the SDK-assembled `finalMessages`
and the request's `incomingMessages`). The save policy - which list to persist for each status -
lives entirely in a pure `conversation-persistence` module, wired as an injected
`onTurnFinish(outcome)` callback; the chat route supplies the callback and never calls an AI-SDK
method itself.

Rationale: the AI SDK is the most load-bearing dependency in the app - its `UIMessage` is the
persisted conversation format and the client contract, and its UI message stream is the wire
protocol. That deep coupling is deliberate. But concentrating the SDK's streaming API in one
module, and mapping its callback shapes into domain types at that boundary, keeps the rest of
the server (routes, persistence policy) and the future option to supplement the server (an
agentic loop, or a skills runtime feeding the UI message stream) free of direct AI-SDK API
calls.

## Considered Options

- **Route calls `toUIMessageStreamResponse` directly (textbook SRP):** rejected. It is the more
  idiomatic AI-SDK shape and a clean orchestration/HTTP split, but it spreads AI-SDK method
  calls into the route and changes `streamChat`'s established `Response` contract, churning
  the existing streaming-chat code and weakening the single-seam boundary the project wants for
  AI-SDK portability.
- **`streamChat` owns the conversation store directly:** rejected. Simplest wiring, but it
  overloads `streamChat` with model orchestration AND persistence AND content logging - three
  reasons to change.
- **Single seam returning `Response`, mapping to a domain `ChatTurnOutcome`, persistence as an
  injected callback (chosen):** keeps every AI-SDK streaming call in one module, exposes only
  domain types, preserves the seam, and keeps the persistence policy a pure, testable unit. It
  takes the idiomatic AI-SDK persistence-mode usage but locates it inside the seam.

## Consequences

- `streamChat` returns a `Response` and is the only file importing `streamText` /
  `toUIMessageStreamResponse`. It maps the SDK finish signals (`onError`, `isAborted`) into a
  `ChatTurnOutcome` (status plus both message lists) via a pure `mapTurnOutcome` function, which
  is unit-tested per branch directly - deterministic, rather than forcing SDK error states
  through a mock model.
- A pure `conversation-persistence` module (no AI-SDK, no HTTP) holds the save policy and
  switches on `status`: completed saves `finalMessages`, error saves `incomingMessages` (so the
  user turn survives a reload-and-retry; a partial assistant message is discarded), aborted is a
  no-op (the prior conversation is left intact).
- The chat route wires store + owner + incoming into the `onTurnFinish` callback and calls no
  AI-SDK method.
- Heavier AI-SDK-portability abstraction (swapping `UIMessage` or the protocol) is explicitly
  not done; future tools and skills work may revisit the orchestration-server boundary.
