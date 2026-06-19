# Edit and regenerate are destructive linear truncate-and-resend; branching preserves alternatives

Multi-conversation management adds three per-message capabilities: regenerate an assistant response, edit a previous user
message, and branch from a chosen message. ChatGPT and Claude.ai preserve alternatives with an
in-conversation sibling-variant TREE, the "2 of 3" prev/next control, which their edit and regenerate
actions create. Anvika targets screen-reader and keyboard users, so the way alternatives are
preserved is an accessibility decision, not just a data-model one.

The decision: edit and regenerate are DESTRUCTIVE truncate-and-resend on the linear `messages` array;
branching copies the transcript prefix into a new, separately-listed conversation as the keep-both
mechanism. There is no in-conversation sibling-variant tree.

Rationale: a sibling tree requires a tree data model plus an active-path pointer, and it forces a
screen-reader user to discover a hidden "2 of 3", understand that toggling it silently rewrites
everything below the edit point, and navigate an invisible branch structure with no landmarks. The
linear model keeps the data model trivial (an array plus the `revision` optimistic-concurrency token)
and makes every preserved alternative a first-class, navigable, separately-listed conversation with
its own title and zero hidden state. That is the right fit for the audience.

## Considered Options

- **Sibling-variant tree (rejected):** nothing is lost and alternatives toggle in place, but it needs
  a tree data model and active-path pointer, and the hidden "2 of 3" is the accessibility problem
  above. The wrong trade for a screen-reader-first app.
- **Destructive linear with no keep-both (rejected):** the simplest model, but it discards
  alternatives entirely, which users reasonably want to preserve.
- **Destructive linear plus branch-to-new-conversation (chosen):** trivial data model; keep-both is
  served by an explicit branch into a real conversation; nothing hidden.

## Consequences

- Edit is the AI SDK built-in `sendMessage({ text, messageId })` (replaces the user message and
  truncates what follows); regenerate is `regenerate({ messageId })` (truncates after the targeted
  assistant message). Both persist through the normal turn-finish path, where `saveTurn` replaces the
  messages array and bumps `revision`.
- Branch is a server endpoint that copies the prefix (up to and including the chosen message) into a
  new row whose id is client-minted with the exhaustive-check `mintConversationId`. Lineage is
  recorded in the `forked_from_id` and `forked_from_message_id` columns (soft, fail-soft, not surfaced
  yet).
- To keep an alternative before an edit or regenerate, branch first; the old line survives as its own
  conversation.
- Heavy branching accumulates conversations, mitigated by delete and the roughly one-billion short-id
  space. Switching between alternatives means switching conversations, an explicit and discoverable
  navigation rather than a hidden toggle.
