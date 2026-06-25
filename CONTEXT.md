# Anvika

Anvika is a fully accessible AI application (Jan/OpenWebUI class) for screen-reader and keyboard-only users - an orchestration layer over AI models, not a model runtime. The glossary below fixes the project's vocabulary so the spec, plans, code, and issues all use one word per concept.

## Language

### Architecture roles

**Server**:
The API-first backend that owns the model registry, AI orchestration, persistence, and settings, exposed as a versioned HTTP contract. It is the heart of the app, runnable on its own. It orchestrates models (cloud providers and the user's own local server) and does not run, host, or serve models itself (ADR 0005). "The server" names the running Hono/Bun process; "the backend" names the architectural layer in contrast to the client.
_Avoid_: engine (that is an inference engine, which Anvika is not).

**Client**:
A consumer of the server's HTTP contract. The web single-page app is the first client; others (e.g. a mobile app) may follow. Clients are thin; business logic lives in the server.
_Avoid_: frontend, web app (when naming the role rather than the specific web client).

**Contract**:
The versioned, typed HTTP API between the server and any client, defined once as Zod schemas and types in `packages/shared` and reused by both sides.
_Avoid_: API surface, interface (when referring to this specific shared boundary).

### Conversation

**Conversation**:
The single ordered list of messages belonging to an owner, persisted as an AI SDK `UIMessage[]` and restored on reload. The user-facing heading for this view is "Conversation".
_Avoid_: thread, chat (as a noun for this concept - "chat" is acceptable only as the verb for the streaming action), session, history.

**Message**:
One entry in a conversation - a role plus ordered content parts (the AI SDK `UIMessage`). Storing the full part list, not plain text, preserves the richer structure that later features rely on.
_Avoid_: post, line, entry.

**Turn**:
One user message together with the assistant response it elicits. The unit the server persists (or, on a non-success outcome, partially persists).
_Avoid_: exchange, round, interaction.

**Owner**:
The identity that data belongs to, defaulted to the constant `local`. It is the seam that lets multi-user be added later as its own subsystem without a rewrite; no accounts or auth exist now.
_Avoid_: user, account, tenant.

**Branch**:
Forking the transcript prefix, up to and including a chosen message, into a NEW separate conversation that is then navigated to. The keep-both mechanism of the linear model: to preserve an alternative before an Edit or Regenerate, Branch first. The UI control is "Branch from here"; lineage is recorded internally in the `forked_from_id` and `forked_from_message_id` columns.
_Avoid_: fork (in user-facing text; "fork" lives only in the internal column names), copy, duplicate.

**Regenerate**:
Re-running an assistant response: dropping that assistant message and everything after it, then resending the preceding user message for a fresh response. Available on any assistant message; regenerating the most recent response is the same action with no explicit target.
_Avoid_: retry (the former name for the last-turn case; the single word is now Regenerate), redo, resend.

**Edit** (message edit):
Changing a previous user message's text, then truncating everything after it and resending, so a new response follows. User messages only; assistant messages are changed by Regenerate.
_Avoid_: revise, amend, rewrite.

### Reasoning

**Thinking**:
The user-facing name for a model's reasoning phase and the content it produces, shown as a distinct collapsible region before the answer and surfaced in announcements. "Thinking" is the only word used in the UI and speech; the code and the AI SDK part keep the name `reasoning`.
_Avoid_: reasoning, chain-of-thought, thoughts (in user-facing text).

**Reasoning effort**:
The single value controlling how much a model thinks: `off | low | medium | high` (plus `inherit` on the override layers). Set per conversation, per connection, or globally; the server resolves the cascade and gates it by model capability. `off` means no thinking.
_Avoid_: thinking mode, reasoning toggle (it is one value, not a separate on/off plus a level).

### Accessibility experience

**Announce utility**:
The single function every screen-reader announcement passes through (`announce(message, priority)`). It prefers the `ariaNotify` web API and falls back to a visually-hidden aria-live region. All heartbeat, completion, error, copy, and quick-nav announcements go through it.
_Avoid_: notify, toast, speak, alert (as a verb).

**Heartbeat**:
The periodic polite spoken status during generation: "Generating response" at the start, "Generating, N seconds" at a configurable interval (default two seconds), and "Response complete" or "Generation stopped" at the end. It keeps a screen-reader user informed without flooding them with streamed tokens.
_Avoid_: progress, pulse, ticker, spinner.

**Quick navigation**:
A keyboard feature addressing the last ten messages by index - `Alt+1` (most recent) through `Alt+0` (tenth most recent). A single press announces the message's descriptor; a double press (within a configurable window) moves focus to the message.
_Avoid_: jump list, recent menu, history shortcuts.

**Descriptor**:
The short spoken summary of a message announced on a single quick-nav press - role, relative time, a leading snippet of the message's opening words, and (when the message is longer than the preview) an exact word-count cue - used to recognise a message by ear without hearing it in full. The opt-in alternative, `full`, reads the entire message.
_Avoid_: summary, preview, snippet (on its own; the snippet is one part of the descriptor).

**Send key mode**:
Which keystroke sends a composed message rather than inserting a newline - either Ctrl/Cmd+Enter sends (Enter makes a newline) or Enter sends (Shift+Enter makes a newline). A user setting, also toggleable on the fly from the composer.
_Avoid_: send key, submit key, enter mode.

### Model layer

**Provider**:
A KIND of model source the server can call - a cloud service (Anthropic, OpenAI, Google, Azure AI Foundry, OpenRouter, xAI) or an openai-compatible server (including the user's own local server). A provider is a TYPE; a configured instance of one is a Connection.
_Avoid_: vendor, service, backend (for a model source).

**Connection**:
A named, owner-configured instance of a provider: its endpoint and its credentials. The owner may keep several connections of the same provider type (say two OpenAI keys, or two openai-compatible servers), each independently named and addressed. The connection, not the provider, is the unit that holds credentials.
_Avoid_: account, profile, integration.

**Model**:
A specific language model the server can call, identified by a model id and carrying capability flags.
_Avoid_: LLM (in user-facing text).

**Model id**:
The namespaced `connectionId:model` string the client sends and the server resolves. The first segment is a CONNECTION id - it selects the connection, and so the endpoint and credentials to use; the second segment is the provider's own model name. Split on the first colon only (a model name may contain colons).
_Avoid_: model name (that is only the second segment); `provider:model` (the prefix is a connection, not a provider).

**Provider registry**:
The server component that resolves a model id to a real, callable model, keyed by CONNECTION id and built fresh per request from the connections the owner has configured. It resolves; it does not list.
_Avoid_: model catalog, available models (those are lists; the registry resolves, the lists list).

**Model metadata**:
The display name, context window, max output, input and output price, and capability flags carried by a model. Supplied by enrichment: live values from a connection's own listing or from models.dev when available, falling back to a committed snapshot floor. A model with no metadata is still offerable.
_Avoid_: catalog (there is no longer a static committed table), seed.

**Available models**:
The list returned by `GET /api/v1/models`: each configured connection's live-discovered models plus its manually added model ids, enriched with model metadata. "Available" means the connection is configured and the model is offerable now.
_Avoid_: catalog (removed), model list.

**Capability flags**:
Per-model booleans that gate features (text generation now; image input and tools later), so a client disables unsupported affordances instead of presenting controls that fail.
_Avoid_: features, abilities.

**Default model**:
The owner's single global model selection, used by any conversation that has not chosen its own. Changing it immediately affects every conversation still inheriting it.
_Avoid_: selected model (ambiguous once a conversation can carry its own), global model.

**Conversation model**:
A conversation's own model choice, which overrides the default model for that conversation only; when absent, the conversation inherits the default. The per-conversation analogue of reasoning effort's override, and the future home for per-conversation generation parameters.
_Avoid_: model override (in user-facing text), per-conversation model (say "conversation model").

**Effective model**:
The model actually used for a conversation's next turn - its conversation model if set, otherwise the default model. The single value chat readiness and the server resolve from.
_Avoid_: resolved model, active model.

### Assistants and extensions

**Assistant** (Custom Assistant):
A named, reusable bundle of instructions, a default model and generation parameters, the tools/MCP servers and Skills it may use, and its knowledge sources. The composition point for Anvika's capabilities; every conversation records which Assistant it used, and a built-in Default assistant always exists.
_Avoid_: agent (reserve for the AI-SDK tool-loop sense), bot, persona, GPT.

**Skill**:
A loadable package in the Claude Agent Skills format - a `SKILL.md` plus optional resources and scripts, surfaced by progressive disclosure - that extends an Assistant. Distinct from a tool or MCP server: a Skill injects packaged instructions and resources; a tool is a callable function.
_Avoid_: plugin, extension, add-on.
