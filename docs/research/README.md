# Research notes index

This directory holds Anvika-specific research notes: design findings captured while building the
app that explain why Anvika does something a particular way. Each file records what was learned
from official docs or Context7 so the reasoning is durable rather than lost after a single change.

Pure library-reference material (how a given framework's API works in general) is not kept here. It
is re-fetched on demand through Context7 when needed, so these notes stay focused on decisions
specific to Anvika.

## Models and providers

- `model-discovery.md` - Live per-provider model-list APIs and the membership-versus-enrichment
  design that keeps the catalog from drifting.
- `models-catalog.md` - How `GET /api/v1/models` was assembled under the retired static catalog
  (superseded by ADR 0023; kept for the historical rationale).
- `local-providers.md` - Connecting to your own already-running OpenAI-compatible server (LM Studio,
  Ollama, llama.cpp); per ADR 0005 Anvika connects to it, it does not run it.
- `openai-compatible-multi-endpoint.md` - Supporting arbitrary OpenAI-compatible providers and
  multiple named endpoints with the Vercel AI SDK.

## Generation and reasoning

- `reasoning-streaming.md` - How reasoning and thinking tokens stream across providers and how
  Anvika normalizes them.
- `context-window-management.md` - Managing the conversation context window when the full history
  is sent on each turn.
- `ai-sdk-message-id-generation.md` - How the assistant `UIMessage.id` is assigned during
  streaming, and why it matters for persistence.

## Configuration and pricing

- `config-management.md` - The settings layering strategy: a Zod schema, Drizzle persistence, and
  reactive Zustand access.
- `fx-frankfurter.md` - The server-side foreign-exchange rate source (Frankfurter) behind the
  USD-to-INR pricing refresh.

## Accessibility

- `screen-reader-focus-management.md` - Moving focus to a chat message for jump-to-message
  shortcuts without disorienting a screen-reader user.
- `screen-reader-select-grouping.md` - How NVDA, JAWS, and VoiceOver announce native `<select>`
  `<optgroup>` labels, behind the model picker grouping.
- `radix-dropdown-browse-mode-fix.md` - Opening a Radix DropdownMenu reliably under screen-reader
  browse and virtual modes.
- `radix-menu-accelerators.md` - In-menu accelerator keys on the conversation context menu (Radix
  ContextMenu and DropdownMenu).
