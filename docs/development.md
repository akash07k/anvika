# Development

This is the working-in-the-code companion to `ARCHITECTURE.md`. Architecture states the rules
and the why; this document holds the mechanics and the footguns - the small, sharp details that
bite when you change something load-bearing. Where a rule lives in `ARCHITECTURE.md`, we link to
it rather than restate it. For the project's vocabulary, see the glossary in `CONTEXT.md`.

## The dev loop

`bun run dev` starts the server and the web client together in watch mode. It runs two scripts in
parallel: `dev:server` (the Hono server on Bun, with `--watch`) and `dev:web` (the Vite dev
server). The server restarts on a server-side change; Vite hot-reloads the client. To bind on your
network instead of loopback, use `bun run dev:host`.

The server is a `serve` command (`apps/server/src/cli.ts`). Its flags, with precedence flag over
environment variable over default:

- `--port <number>` / `ANVIKA_PORT` - the listen port.
- `--data-dir <path>` / `ANVIKA_DATA_DIR` - where the SQLite database, settings files, and logs
  live (defaults to a `userdata/` folder under the app root).
- `--no-open` - do not open the browser on start (the dev script sets this).
- `--log-level <level>` / `ANVIKA_LOG_LEVEL` - the lowest level emitted
  (`trace`, `debug`, `info`, `warning`, `error`, `fatal`, or `off`); default `info`.
- `--log-category <cat>=<level>` / `ANVIKA_LOG_CATEGORIES` - a per-category override, for example
  `--log-category persistence=debug`.
- `--log-content` / `ANVIKA_LOG_CONTENT` - log message text to the server logs. It is OFF by
  default and is a development-only operator opt-in; never enable it where a real prompt could be
  logged. The `dev:server` script enables it for local debugging.

Bun auto-loads a `.env` file for both the runner and the server, so a local `.env` with a
provider key is picked up with no extra wiring. Bun honors a real environment variable over a
`.env` value, which the end-to-end suite relies on to force content logging off regardless of your
local `.env`.

## Where things live

The repository is a Bun workspace. The full map and the package responsibilities are in
`ARCHITECTURE.md`; in brief:

- `apps/server` (`@anvika/server`) - the server: AI orchestration, persistence, the model
  registry, settings, and the HTTP routes under `/api/v1`.
- `apps/web` - the Vite/React client.
- `packages/shared` (`@anvika/shared`) - the Zod schemas and types of the HTTP contract.
- `tooling/` - scripts and the launcher.
- `tests/e2e/` - the Playwright end-to-end suite.

### The Bun-import confinement rule

`bun:sqlite` and `drizzle-orm/bun-sqlite` are imported in exactly two places: the
`apps/server/src/persistence/drizzle/*` modules and the `server.ts` composition root that wires
them. Nothing else may import them. The reason is the test runner: Vitest workers run under Node
(even via `bun run`), and a Node module graph that reaches a `bun:` import fails to load. Confining
those imports to the persistence package keeps the Vitest graph clean, so everything behind the
`ConversationStore` port is unit-testable under Vitest with an in-memory fake, while the Drizzle
adapter itself is exercised under `bun test` in `*.bun.test.ts` files.

Static client serving follows the same discipline: it reads files with `Bun.file`
(`apps/server/src/assets/filesystem-asset-source.ts`), and the source that uses it is only reached
when a built `dist` directory exists, so a Node test never loads it.

## AI SDK gotchas

The chat path leans on the AI SDK (`ai`, `@ai-sdk/*`). A handful of its behaviors are non-obvious
and have bitten us; each is verified against the code cited.

### The empty assistant message id

`toUIMessageStreamResponse` will leave the assistant message's `id` an empty string when no
`generateMessageId` is supplied and the provider sends no start id - which is exactly what a local
openai-compatible server does. The SDK's start-id guard is `== null`, so an empty string slips
through it. We supply a generator explicitly, so the assistant message always carries a stable
server-side id:

```ts
generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
```

(`apps/server/src/chat/stream-chat.ts`, in the `toUIMessageStreamResponse` options.) This pairs
with `ensureMessageIds` (`apps/server/src/chat/ensure-message-ids.ts`), which backfills any blank
id on persistence and on heal-on-read, and with a client fallback so render and focus always agree
on one handle even if an id is missing:

```ts
return typeof id === 'string' && id.trim() !== '' ? id : `pos-${index}`;
```

(`messageDomId` in `apps/web/src/lib/message/anvikaMessage.ts`.) Role jumps resolve by index, so a blank id
never strands focus.

### Abort visibility

An aborted turn produces zero server log unless the SSE stream is consumed server-side. The SDK's
`onFinish` (and our abort log) only runs when the stream is drained, which the client stops doing
the instant it disconnects. So we pass the SDK's `consumeStream` and forward the request's abort
signal into `streamText`:

```ts
consumeSseStream: consumeStream,
```

```ts
...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
```

(both in `apps/server/src/chat/stream-chat.ts`; the route passes `abortSignal: c.req.raw.signal`
into `streamChat`, `apps/server/src/routes/chat.ts`.) An abort is logged once at `info` ("turn
aborted"). The save policy treats it as a deliberate Stop, distinct from an error - see the
write-once rule in `ARCHITECTURE.md`.

### Per-turn requestId correlation

The SDK hides the real mid-stream provider cause from the client, so the user only ever sees a
masked "An error occurred." To tie that back to the real server cause without plumbing the raw
error to the browser, each turn carries a correlation id. The client mints one and sends it as the
`x-anvika-request-id` header (`beginTurn` in `apps/web/src/lib/api/requestId.ts`); the server bounds it
at the trust boundary (length-capped, else dropped) and stamps it on every chat log line
(`apps/server/src/routes/chat.ts` and `stream-chat.ts`); and the error region shows "Reference:
&lt;id&gt;" to the user (`apps/web/src/components/ChatErrorRegion.tsx`). The raw provider error never
leaves the server.

### The settings PATCH boundary uses a loose object

`PATCH /api/v1/settings` accepts a partial, deeply nested update, so its boundary schema must PASS
unknown keys through. Use `z.looseObject({})`, not `z.object({})` - a plain object schema strips
unknown keys, and the downstream deep-merge would then silently no-op:

```ts
export const SettingsPatchSchema = z.looseObject({});
```

(`packages/shared/src/settings/contracts.ts`.) The real guarantee is not this shallow boundary; it
is the post-merge re-validation of the whole merged object against `SettingsSchema`
(`patchSettings` in `apps/server/src/settings/service.ts`). Do not tighten the PATCH schema to a
typed object.

### Reasoning replay sanitization

`ARCHITECTURE.md` states the rule: replay is stateless, so reasoning artifacts are stripped from
the model-facing replay copy and only that copy. The mechanics are two passes over the messages,
both content-safe (they read part `type` and metadata keys, never message text):

- `stripItemReferences` (`apps/server/src/chat/replay-sanitization.ts`) deletes every
  `providerMetadata.*.itemId` from a copy, dropping a namespace that becomes empty. This is the
  subtle half: the OpenAI Responses provider stamps an `itemId` on assistant text parts, which
  becomes a dangling `item_reference` on a model switch, and pruning reasoning alone does not
  remove it.
- `pruneReasoningForReplay` (`apps/server/src/chat/replay-sanitization.ts`) then drops reasoning parts
  with the SDK's own `pruneMessages({ reasoning: 'all' })`.

In `stream-chat.ts` the order is `stripIncompleteTurns(stripItemReferences(...))` fed into
`pruneReasoningForReplay`. The persisted and displayed history is untouched.

### Provider reasoning gotchas

Reasoning is never emitted unless a provider is explicitly asked, and asking a non-reasoning model
can ERROR the turn. So capability is gated by a conservative, data-driven table - first match wins,
anything unlisted gets no reasoning, and adding a newly released model is a one-line edit
(`REASONING_RULES` in `apps/server/src/models/reasoning-rules.ts`). The capability lookup is
`apps/server/src/models/reasoning-capability.ts`. Per-provider specifics worth knowing:

- OpenAI: reasoning SUMMARIES are gated behind organization verification and hard-fail an
  unverified org, so only `reasoningEffort` is sent, never a summary request
  (`reasoning-rules.ts`).
- Azure: a DeepSeek or Kimi deployment must be routed through the `azure.deepseek()` factory to
  surface `reasoning_content`; the generic registry path uses the default factory and drops it.
  The model resolver detects these by deployment name
  (`isAzureReasoningContentDeployment`) and switches factories
  (`resolveModelFromSettings` in `apps/server/src/models/registry.ts`).
- Google: rolling aliases such as `gemini-flash-latest` carry no version, so a version-prefix match
  would miss them; they are matched by exact id (`reasoning-rules.ts`).
- Local (openai-compatible): reasoning is best-effort. The SDK parses `reasoning_content` and
  `reasoning`, with a `<think>`-tag extraction middleware as a fallback. Enabling sends
  `reasoning_effort` plus `chat_template_kwargs: { enable_thinking }`, but the Jinja switch only
  takes effect if the server was launched with `--jinja`. A strict server may reject
  `chat_template_kwargs` outright, so every local connection has a `sendThinkingParams` escape-hatch
  toggle (`localReasoningProviderOptions` in `apps/server/src/chat/resolve-reasoning.ts`); an HTTP
  400 surfaces a hint pointing at it. Local "off" is an active suppress, because some local servers
  default thinking on.

### Azure base URL normalization

Azure connections use the default `@ai-sdk/azure` provider (the Responses API on the v1 endpoint).
That provider appends `/v1` to the configured base URL, so a base URL that already ends in `/v1`
would double to `.../v1/v1`. `normalizeAzureBaseUrl`
(`apps/server/src/models/registry.ts`) strips a single trailing `/v1` so a pasted
`https://{resource}.openai.azure.com/openai/v1` resolves correctly. A connection can also set an
explicit `apiVersion`, which is forwarded to `createAzure` when present.

## Logging facts

The full logging standard is `docs/agents/logging.md`; these are the mechanical details that catch
people out. Logging is content-safe by construction - structured fields carry ids, counts,
durations, and enums, never prompt or response text and never an API key.

- The level methods are `trace`, `debug`, `info`, `warning` (also spelled `warn`), `error`, and
  `fatal`. There is no generic `.log(level)`; the codebase calls `.warning` for the warning level.
- Turning a scope truly OFF (fatal included) needs both an empty sink list AND
  `parentSinks: 'override'`. LogTape sinks inherit from ancestor loggers, so an empty sink list
  alone would still log through the base `anvika` sinks (`loggerFor` in
  `apps/server/src/logging/setup.ts`).
- Crash visibility is separate from the level filter. Uncaught exceptions and unhandled rejections
  write to stderr always, and an uncaught exception exits non-zero
  (`apps/server/src/logging/error-sinks.ts`). So the level filter governs verbosity while death is
  always reported, even at `--log-level off`.
- Configure LogTape at the composition root, before any logger is acquired - records emitted before
  `configure` runs are dropped. The error handlers are installed after `configureLogging`.

## Settings and secrets behavior

Settings persist as hand-editable JSON in the data directory: `settings.json` (a `{ version,
settings }` envelope) and `secrets.json` (secret leaves only). Because a person may edit these by
hand, the store has safety rails (`apps/server/src/settings/service.ts` and
`apps/server/src/persistence/file/file-settings-store.ts`):

- Refuse to overwrite an unreadable file. If `settings.json` cannot be read or parsed, a blind save
  would clobber the broken-but-present file. So a load that recovered to defaults blocks the next
  write with the `file-invalid` reason (surfaced to the client as the `settings-file-invalid` API
  error and a confirmation dialog) unless the caller passes `overwriteInvalid: true`, an explicit
  user confirmation.
- Fail soft on read. A corrupt or unmigratable row falls back to schema defaults with a `recovered`
  flag (logged at `warning`, no values logged) rather than bricking settings. The `recovered` flag
  is announced to the user rather than silently reverting their file.
- Serialize writes. Every writer routes through a single in-process write queue (a promise chain on
  the store), so a later failed write's rollback can never clobber an earlier success.

Each file is written atomically: write a sibling temp file, then `rename` over the target. On
Windows, `rename` can transiently fail with `EPERM`, `EBUSY`, or `EACCES` when antivirus or the
Search Indexer briefly locks the file, so the write retries a few times with a short backoff before
giving up and removing the temp file (`writeFileAtomic` in
`apps/server/src/persistence/file/atomic-write.ts`). `Bun.write` is deliberately not used here
because it is not atomic. `secrets.json` gets best-effort `0600` permissions (a no-op on Windows).

## Client patterns

These are the client-side patterns that keep the screen-reader and keyboard experience correct;
the accessibility model itself is in `ARCHITECTURE.md`.

### Gate the conversation render on the query

The conversation view must mount already hydrated, not have messages pushed into it after mount.
`useChat` reads its initial `messages` once at mount, so the route gates rendering on the TanStack
Query: while the detail query is pending it shows a loading state, and only once data is present
does it mount `ConversationView` with the persisted messages as `initialMessages`
(`apps/web/src/routes/c.$conversationId.tsx`, the `isPending` gate before
`<ConversationView ... initialMessages={...} />`). A stable `key={conversationId}` remounts the
view on a conversation switch so the hydration runs fresh.

### Focus on mount is a one-shot intent flag, not a timeout

New-conversation composer focus uses a one-shot "focus the composer" intent that is set only on an
intentional in-app navigation and consumed exactly once by the matching conversation's composer
when it mounts (`requestComposerFocus` / `consumeComposerFocus` in
`apps/web/src/lib/conversation/composerFocusIntent.ts`). It is deliberately a plain module value scoped to a
conversation id, not React state and not a fixed timeout: a timeout raced the cold detail fetch,
and a module value means a fresh page load starts with no intent, so a reload never auto-steals
focus - only an in-app navigation does.

### Hotkey footguns

The chat shortcuts use react-hotkeys-hook (`useChatHotkeys` in
`apps/web/src/hooks/shortcuts/useChatHotkeys.ts`); the bindings are a rebindable keymap with defaults in
`packages/shared/src/settings/keymap.ts`.

- Modifiers match strictly (`ignoreModifiers` defaults false), so the `alt+enter` toggle never
  collides with a plain `enter` (the default send is `ctrl+enter, meta+enter`, the toggle is
  `alt+enter`). A modifier in a binding means that exact modifier set.
- A `useHotkeys` dependency array must list the parent options object's primitive FIELDS, not the
  object itself. The parent often rebuilds an options object every render (each heartbeat tick, for
  example), so depending on the object re-registers every binding on every render. The quick-nav
  bindings depend on the individual fields of `timestampOptions` and `displayNames` for this reason.
- The Alt namespace is crowded, so bindings avoid known collisions: Firefox access keys
  (`Alt+F/E/V/S/B/T/H`), `Alt+D`, and the bindings already in use (`Alt+A`, `Alt+U`, `Alt+C`, and
  `Alt+1` through `Alt+0`). Stop is `Shift+Escape`, not plain `Escape` - a screen reader intercepts
  plain `Escape` in the composer, and `Alt+S` would open Firefox history.
