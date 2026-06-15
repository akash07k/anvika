# Conversation context-window management

Research for context-window management: the server sends the full conversation history every
turn, unbounded, so a long chat eventually exceeds the model's context window and the turn
hard-fails. Staged plan: first, a lean mechanical token-budget TRIM at the `streamChat` seam
(the safety net); then an opt-in SUMMARY-BUFFER memory mode; later, heavier frameworks. This
doc captures the research behind that plan. Verified against installed
`ai@6.0.197` and primary provider/library sources (URLs at the end).

## 1. What the Vercel AI SDK gives us (and does not)

Verified against the installed `ai@6.0.197` source.

- NO built-in token-budget trimmer. `streamText`/`generateText` send `messages` as-is; overflow
  is a provider error. There is no context/memory abstraction (`ToolLoopAgent` has none).
- `pruneMessages` is an artifact-shape filter ONLY: it strips reasoning / tool-call / tool-result
  / empty parts by POSITION (`'all'` / `'before-last-message'` / per-tool windows). It has no
  token logic, no oldest-first dropping, no summarization. Anvika already uses it correctly
  (`reasoning: 'all'`) in `apps/server/src/chat/replay-sanitization.ts`.
- NO pre-call token counter anywhere in the SDK. Token counts are available ONLY after the call
  via `result.usage` / `onFinish` (`event.totalUsage.*`), which Anvika already reads in
  `stream-chat.ts`. Pre-call budgeting must be built by us.
- NO model context-window / max-input-tokens exposed on `LanguageModelV3` or any provider object.
  We must source and maintain limits ourselves (the model registry is the natural home).
- Two pre-call hooks exist but are NOT the right fit here: `prepareStep` (per-agent-step messages
  override; fires on step 0 too but is designed for tool loops) and a `wrapLanguageModel`
  `transformParams` middleware (receives the low-level `LanguageModelV3Prompt`, not `ModelMessage[]`).

Conclusion: we build the trim ourselves as a pure pre-call helper.

## 2. The integration seam (where the trim slots in)

A plain pure helper on `replay.messages`, inserted in `apps/server/src/chat/stream-chat.ts`
between the prune/strip pipeline and the `streamText` call (around lines 97-108):

```text
stripItemReferences then stripIncompleteTurns then pruneReasoningForReplay then trimToContextBudget then streamText
```

Rationale: `replay.messages` is already `ModelMessage[]` (the natural unit for a token estimate);
the replay pipeline already establishes "transform the replay copy only, leave `originalMessages`
untouched" (the persisted/displayed history is unpruned), so a budget trim belongs as the final
stage of that same chain; and a plain helper avoids coupling to the conditional
`reasoningModelFor` middleware wrap and keeps ADR 0009's single `streamText` seam intact. Emit a
content-safe `droppedCount` diagnostic like the existing `prunedReasoning` debug log.

New module: `trimToContextBudget(messages: ModelMessage[], opts): { messages, droppedCount }`
alongside `replay-sanitization.ts`, plus a `computeBudget(contextWindow, reserveForResponse, safetyMargin)`.

## 3. The trim algorithm (the safety net)

Default policy: token-budget, drop-oldest, system-pinned (the proven baseline; LibreChat's
`'discard'`, AnythingLLM, Jan's trimmer all converge here).

Budget formula (input and output draw from the SAME window, per Anthropic/OpenAI/Google docs):

```text
inputBudget = contextWindow - reserveForResponse - safetyMargin
```

- `reserveForResponse = maxOutputTokens`, PLUS the thinking budget when reasoning is enabled
  (Anthropic thinking is a subset of max_tokens billed as output; OpenAI o-series reasoning shares
  the output cap and can exhaust it before any visible text; Gemini thinkingBudget is billed as
  output). For reasoning models size the reserve generously (OpenAI suggests ~25k as a starting
  floor for reasoning + output).
- `safetyMargin = max(0.05 * contextWindow, 1024)` tokens, absorbing estimator error, hidden
  tool/system overhead, per-provider tokenizer drift, and the late-failure overflow behavior
  (Claude 4.5+ accepts an over-budget request then fails mid-generation, billing partial output).

Fill-to-budget pseudocode (newest-to-oldest, with the coherence repairs):

```text
function trimToBudget(system, messages, contextWindow, reserveForResponse, safetyMargin):
    budget = contextWindow - reserveForResponse - safetyMargin
    used = system ? countTokens(system) : 0      # system always kept, costs budget
    kept = []
    for msg in reverse(messages):                # 1. fill newest to oldest
        cost = countTokens(msg)                  # include per-message role/format overhead
        if used + cost > budget: break
        kept.prepend(msg); used += cost
    while kept not empty and kept[0].role != 'user':   # 2. history must start on a user turn
        used -= countTokens(kept[0]); drop kept[0]
    enforceToolPairAtomicity(kept)               # 3. drop orphan tool-call/result units
    return (system ? [system] : []) + kept
```

Hard coherence rules (all provider-enforced; violating them is a 400):

1. History must start on a user turn (drop leading dangling assistant/tool messages).
2. Never split a multi-part message; keep or drop the whole message.
3. Tool-call + its tool-result(s) are ONE atomic unit (a tool result may only follow its
   assistant tool-call; both providers 400 otherwise). Build the trimmer group-aware now even
   though tools arrive later, OR add Jan-style orphan repair, so it does not break later.

Note: "always keep the FIRST user message" is a common app heuristic but NOT a documented
standard; keep it optional, not a hard rule.

## 4. Tokenization plan (Bun + multi-provider)

There is NO single tokenizer correct for all providers (OpenAI cl100k/o200k; Anthropic its own;
Llama/Qwen/Gemma/Mistral different SentencePiece/BPE). An exact universal count is impossible, so
for a SAFETY NET we estimate and add a conservative margin (over-count, never under-count).

- OpenAI-family models: `gpt-tokenizer` (pure JS, ~1 MB minzipped, no WASM, actively maintained).
  Pick the encoding by model (o200k_base for GPT-4o/4.1/5/o-series; cl100k_base for GPT-4/3.5).
- All other providers (Anthropic, Google, local Llama/Qwen/Gemma/Mistral/GPT-oss, OpenRouter):
  a calibrated chars-per-token heuristic for the trim decision (~4 chars/token Latin, more for
  CJK). Lands within ~10-15%, the same error band as borrowing the wrong model's real tokenizer,
  at near-zero cost and no bundle bloat. Optionally upgrade specific families later to
  `@huggingface/tokenizers` (~8.8 KB gzipped, loads a bundled `tokenizer.json`) if precision is
  needed.
- Calibrate drift from the authoritative `result.usage` returned AFTER each generation to inform
  the next turn's budget.

CONFIRMED warning: avoid the WASM `tiktoken` / `@dqbd/tiktoken` under `bun build --compile`
(Anvika ships a single binary). It works under `bun run` but its CJS entry does
`readFileSync(__dirname + 'tiktoken_bg.wasm')`, which the compiler bakes as a build-machine path,
so the compiled binary throws `Missing tiktoken_bg.wasm` (dqbd/tiktoken#154, oven-sh/bun#14551).
`gpt-tokenizer` is pure JS and has no such issue. Also avoid `gpt-3-encoder` (abandoned, r50k only).

Provider count-tokens endpoints (Anthropic `/v1/messages/count_tokens`, Google `models.countTokens`,
OpenAI `/v1/responses/input_tokens`) exist but are NOT worth it as the primary mechanism: each is a
network round-trip on the hot path before streaming (bad for the announcement/heartbeat timing),
coverage is partial (local + OpenRouter have nothing), and exact tool/image accounting does not
matter for text chat. Treat as an optional precision upgrade later.

## 5. Model-limits data sources (contextWindow + maxOutputTokens)

- Cloud: bundle a `models.dev` `api.json` snapshot (`limit.context` / `limit.output`; strong open-
  model coverage, has `lmstudio`/`llama`/`ollama-cloud` keys), refreshed periodically; cross-check
  Gemini via its live `models.get` (`inputTokenLimit`/`outputTokenLimit`); tolerate null max-output
  (OpenRouter omits it ~18% of the time) with a safe floor. This is the same models.dev source the
  registry already uses for price/limits enrichment (ADR 0012/0023).
- Local servers: the standard openai-compatible `/v1/models` does NOT carry context size, but every
  major local runtime exposes the LIVE launched value via a native endpoint, which is MORE accurate
  than a catalog (it reflects how the user actually loaded the model):
  - LM Studio: `GET /api/v0/models` returns `max_context_length` and `loaded_context_length`.
  - Ollama: `POST /api/show` returns `model_info["<arch>.context_length"]`.
  - llama.cpp llama-server: `GET /props` returns `default_generation_settings.n_ctx`.
  - KoboldCPP: `GET /api/extra/true_max_context_length` (also has llama.cpp-style `/props`).
- Unknown-limit fallback: a configurable setting (surfaced in Settings), default 8192 context
  (4096 is too small for modern local models), with a conservative max-output fallback (~2048-4096).
  Always prefer a probed/catalog value; use the default only when every source fails.

## 6. Edge cases and failure modes

- Single message larger than the whole budget: do NOT silently produce an empty window. Truncate
  its content, summarize/chunk it, switch to a larger-context model, or reject with a clear
  content-safe error. (LangChain gates intra-message splitting behind `allow_partial`.)
- Trimming breaks tool-call/result adjacency: OpenAI and Anthropic both 400; an Anthropic session
  can be bricked until rewound. Keep tool pairs atomic; drop orphans as units after the fill.
- Reasoning parts in replayed history: strip prior-turn reasoning by default to save budget (Anvika
  already does via `pruneReasoningForReplay`), but NEVER strip or modify reasoning WITHIN an active
  tool-use turn (Anthropic 400s if a thinking block in the latest assistant message is modified).
- First turn already over budget: pre-check input size and surface a clear error before the user
  sees a raw provider failure.
- Multimodal/attachment parts (once attachments arrive): images cost real tokens against the same
  budget and are atomic (keep or drop the whole part); never split.

## 7. Accessibility surface (the differentiator)

Every silent-drop app (Open WebUI's 2048 default, AnythingLLM dropping past 3 pairs, ChatGPT)
produces "the model forgot" confusion with no signal. The modern agentic tools converged on
DISCLOSING trimming (Claude.ai "summarizes earlier messages"; Copilot inserts "Summarized
conversation history"; Roo/Cline show a "Condensing context..." row with before/after counts).
For Anvika's screen-reader audience:

- Announce ONCE, politely, via the existing `announce()` utility: a content-safe notice like
  "Earlier messages trimmed to fit the model's context." Governed by WCAG 2.2 SC 4.1.3 Status
  Messages: use `role="status"` (polite), NOT `role="alert"`/assertive; the live region must exist
  before the text is inserted. `ariaNotify` (normal priority) fits but lacks Safari/VoiceOver, so
  keep the aria-live fallback (Anvika's existing decision); do not double-announce.
- Render a PERSISTENT, navigable marker in the transcript: since every message already gets a
  heading, render the trim/summary notice as a system message WITH ITS OWN HEADING ("Earlier
  messages summarized") so it lands in the heading list. The transcript is `role="log"`.
- Log METADATA ONLY (counts, token totals, "trimmed N messages", before/after) - never the trimmed
  or summarized text, per the never-log-content rule and the `--log-content` opt-in.

## 8. Opt-in summary-buffer memory (reuses the budget math)

Opt-in, OFF by default (it costs an extra blocking model call and risks summary drift / silent goal
loss). Mechanism (LangChain `ConversationSummaryBufferMemory` / langmem / LlamaIndex
`ChatSummaryMemoryBuffer`): keep recent turns verbatim that fit `inputBudget - summaryReserve`; on
overflow, fold the OLDEST overflowed turns into a running summary via one incremental summarizer
call that combines the previous summary with the newly-overflowed turns, prepended as a system message
after the main system prompt; persist the running summary so already-summarized turns are never
re-summarized; trigger on a token threshold, not every turn. Summarizer model is a capability-
flagged setting (default the same model, allow a cheaper one). The summary is response content
(never logged by default).

Clean seam: the trim safety net ships `computeBudget()` + `trimToBudget()` (fill walk, coherence
repair, tool-pair atomicity, injected token counter). The summary-buffer mode reuses the SAME
`computeBudget()` and fill walk, adding only the summary-reserve subtraction, the overflow-fold
summarizer call, and running-summary persistence. No budget math is duplicated. (Provider-native
context editing, e.g. Anthropic's `clear_tool_uses` + memory tool, is worth evaluating as a
provider-specific fast path once tools land.)

## 9. Comparable-apps baseline (one-line each)

- LibreChat: server-side token-budget drop-oldest (`'discard'`) by default, optional rolling
  summary; system pinned; real BPE tokenizer (`ai-tokenizer`). The closest model to follow.
- AnythingLLM: server-side budget trim + middle-truncation ("cannonball"); `js-tiktoken`;
  model limits from a LiteLLM map. Lesson: don't middle-truncate (splits code/UTF-8).
- Jan: client-side token-budget sliding window + optional `compactMessages`; system kept separate;
  tool-pair atomic with orphan repair; heuristic counter (chars/3.5). Reads llama-server `/props`
  for true `n_ctx`. Lesson: prefer deterministic app-side trimming over the local runtime's KV context-shift.
- Lobe Chat: message-count window + auto rolling-summary; group-aware `HistoryTruncate` keeps tool
  groups intact; heuristic (`tokenx`) with a 1.25x drift multiplier. Lesson: a count knob that a
  token budget silently overrides is misleading.
- Open WebUI, Big-AGI: deliberately do NOT trim (pass-through / warn-only); both pay with hard
  overflow errors and "the model forgot" complaints. The counter-examples.

## Sources

AI SDK (installed + docs): `node_modules/.bun/ai@6.0.197/.../ai/src/generate-text/prune-messages.ts`,
`.../prepare-step.ts`, `.../middleware/wrap-language-model.ts`, `.../types/usage.ts`;
<https://ai-sdk.dev/docs/reference/ai-sdk-ui/prune-messages>;
<https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text>; <https://github.com/vercel/ai/issues/7515>.

Budget + reserve + counting: <http://blog.pamelafox.org/2024/06/truncating-conversation-history-for.html>;
<https://reference.langchain.com/python/langchain-core/messages/utils/trim_messages>;
<https://platform.claude.com/docs/en/build-with-claude/context-windows>;
<https://platform.claude.com/docs/en/build-with-claude/extended-thinking>;
<https://platform.claude.com/docs/en/build-with-claude/token-counting>;
<https://developers.openai.com/api/docs/guides/reasoning>; <https://ai.google.dev/gemini-api/docs/thinking>.

Tokenizers + limits: <https://www.npmjs.com/package/gpt-tokenizer>; <https://github.com/dqbd/tiktoken/issues/154>;
<https://github.com/oven-sh/bun/issues/14551>; <https://github.com/johannschopplich/tokenx>;
<https://github.com/sst/models.dev>; <https://lmstudio.ai/docs/app/api/endpoints/rest>;
<https://github.com/ollama/ollama/blob/main/docs/api.md>;
<https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md>; <https://lite.koboldai.net/koboldcpp_api>.

Summary-buffer: <https://langchain-ai.github.io/langmem/guides/summarization/>;
<https://developers.llamaindex.ai/python/examples/agent/memory/summary_memory_buffer/>;
<https://redis.io/blog/context-window-overflow/>.

Accessibility/UX: <https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html>;
<https://roocodeinc.github.io/Roo-Code/features/intelligent-context-condensing>;
<https://support.claude.com/en/articles/11647753-understanding-usage-and-length-limits>.

Comparable apps: <https://docs.openwebui.com/troubleshooting/context-window/>;
<https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/summarization>;
<https://github.com/Mintplex-Labs/anything-llm>; <https://github.com/menloresearch/jan>;
<https://github.com/lobehub/lobe-chat>.
