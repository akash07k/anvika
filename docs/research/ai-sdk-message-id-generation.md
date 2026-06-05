# AI SDK message id generation (UIMessage persistence)

How the assistant `UIMessage.id` is assigned by `toUIMessageStreamResponse` / `toUIMessageStream`,
why it can end up empty, and how Anvika guarantees a non-empty id. Verified against `ai@6.0.197`
(`node_modules/.bun/ai@6.0.197.../node_modules/ai/dist/index.mjs`).

## The bug this explains

Some persisted assistant messages had `id: ""`. In the live conversation these were the turns from
the local openai-compatible provider (LM Studio), and they broke quick-nav double-press focus and the
Alt+A role jump (both resolve a message by id) and caused duplicate React keys / DOM ids.

## Mechanism (verified in source)

`streamText(...).toUIMessageStreamResponse({ originalMessages, generateMessageId?, ... })` assembles
the assistant `UIMessage`. The id is resolved through `handleUIMessageStreamFinish`:

- The response message id is `generateMessageId != null ? getResponseUIMessageId(...) : undefined`,
  and the stream is finalised with `messageId: responseMessageId ?? generateMessageId?.()`
  (index.mjs ~8135). With NO `generateMessageId`, this is `undefined`.
- The start-chunk id is only injected when the provider supplied none:
  `if (startChunk.messageId == null && messageId != null) startChunk.messageId = messageId`
  (index.mjs:5944). Note `== null` - an empty STRING is not null, so a provider-supplied `""` is
  never replaced, even with `generateMessageId` set.
- The assembled message id initialises to `messageId != null ? messageId : ""` (index.mjs ~5960),
  and the client mirrors it: `if (chunk.messageId != null) state.message.id = chunk.messageId`
  (index.mjs:5851) - again `""` passes through as the id.

So: a cloud provider that returns a response id yields a real id; a provider that returns none, with
no `generateMessageId` configured, yields `""`. The `GET` validator `safeValidateUIMessages` accepts
`id: ""`, so the empty id survives reload.

## The fix Anvika applies (defense in depth)

1. Server, stream: pass `generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 })` to
   `toUIMessageStreamResponse` (the documented mechanism; covers the provider-id-absent case for the
   live client and the persisted copy). `createIdGenerator` and `generateId` are exported from `ai`.
2. Server, persist: `ensureMessageIds` backfills any blank/missing id before `store.save`
   (`apps/server/src/chat/conversation-persistence.ts`) - the authoritative guarantee that also
   covers the empty-STRING case the SDK's `== null` guard misses.
3. Server, read: `GET /api/v1/conversation` runs loaded messages through `ensureMessageIds` and
   re-persists ONCE when an id changed (heals rows written before the fix); a clean read does not
   write.
4. Client: `messageDomId(message, index)` (`apps/web/src/lib/message/anvikaMessage.ts`) returns a stable
   `pos-<index>` handle when an id is momentarily blank, used by `MessageList` (key + heading id) and
   `useChatHotkeys` (focus), so a blank id can never collide or break focus even before a reload.

## Related

Recording the resolved `provider:model` id per turn would have made this provider-specific
behaviour directly visible from the persisted turn, rather than requiring a DB dump to correlate.
