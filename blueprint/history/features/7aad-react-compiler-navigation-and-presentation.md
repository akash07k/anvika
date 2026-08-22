# Feature: React Compiler navigation and presentation

**From build-plan:** feature 7aad
**Status:** not started

## Goal

Remediate the remaining candidate `react/react-compiler` diagnostics in completion
focus, keyboard shortcuts, per-conversation model and reasoning controls, and
time-based presentation. Preserve keyboard navigation, deterministic announcements,
optimistic override writes, message-edit behavior, and screen-reader focus recovery.

## In scope

- Compiler-safe completion-focus ownership between `ConversationView` and
  `useFocusOnCompletion`.
- Compiler-safe registration of chat, conversation, and global shortcut bindings.
- Compiler-safe model and reasoning override synchronization without changing
  optimistic persistence behavior.
- Moving render-time wall-clock reads in message and conversation-list presentation
  behind a committed refresh value.
- Focused web and browser tests for the affected keyboard, focus, persistence, and
  date-relative rendering behavior.
- A candidate, type-aware scoped Oxc run using the documented experimental
  `react/react-compiler` rule.

## Out of scope

- Updating `oxlint`, `oxlint-tsgolint`, `bun.lock`, lint scripts, or
  `.oxlintrc.json`; feature 7aaf owns final lint-gate adoption.
- Any lint suppression, rule downgrade, ignore-pattern expansion, or compatibility
  workaround.
- End-to-end AxeBuilder imports, owned by feature 7aae.
- HTTP routes, shared schemas, persistence formats, Provider behavior, or changes to
  the user-visible shortcut map and generation-control contract.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan the current step before changing code.
2. Implement only that step and show its diff.
3. Review the diff and confirm its observable done-when.
4. Obtain approval before moving to the next step or creating an optional checkpoint.

## Build steps

- [x] **Step 1 - Move completion-focus intent into compiler-safe ownership** - replace
  the mutable pending-focus ref flow between `ConversationView` and
  `useFocusOnCompletion` with committed state and a completion acknowledgment. Preserve
  move-mode-only focus and the positional fallback for an assistant message without a
  server id. *Done when:* a completed response moves focus to its heading exactly once
  only when configured, a missing target leaves the request pending until it mounts, and
  focus never falls through to `<body>`.

- [x] **Step 2 - Make chat shortcut registration compiler-safe** - refactor the chat
  shortcut and quick-nav binding structure without changing resolved keymap bindings,
  composer behavior, role jumps, double-press semantics, notification text, or
  content-safe diagnostics. *Done when:* Stop, composer and role jumps, thinking
  controls, and all ten quick-nav slots work while the composer is focused; a quick-nav
  second press still focuses rather than rereads; and rerenders use current messages,
  labels, timestamps, and shortcut settings.

- [x] **Step 3 - Preserve app-wide conversation and help shortcuts** - make the
  conversation quick-switch and global-help binding lifecycles compiler-safe while
  retaining navigation and form-focus behavior. *Done when:* new-conversation,
  advanced-new, conversation-list focus, all ten conversation quick-nav slots, and
  keyboard-shortcuts help remain reachable from form controls; an empty slot announces
  the established no-op and does not navigate; and current open handlers and list data
  are used after rerender.

- [x] **Step 4 - Reconcile model overrides without render-time ref synchronization** -
  refactor `useConversationModel` state ownership so persisted or active-draft changes
  seed the visible selection safely while optimistic writes, superseded selections,
  rollback, invalidation, and `beforeSend` keep their timing. *Done when:* a changed
  conversation or draft seed updates the control, unrelated rerenders retain the
  optimistic choice, only the latest failed write rolls back, and an in-flight write is
  awaited before sending.

- [x] **Step 5 - Reconcile reasoning overrides without effect-driven state updates** -
  refactor `useConversationReasoning` to retain persisted reseeding, capability
  derivation, optimistic writes, the Alt+T three-case decision, and exactly one
  content-safe effort announcement. *Done when:* persisted refreshes update the
  effective override, unavailable Models keep the control disabled, a failed write
  announces the existing safe error, and Alt+T continues to select and announce the
  same resolved effort.

- [x] **Step 6 - Make time-based presentation deterministic to React** - expose a
  committed current-time value from the existing midnight-refresh lifecycle and use it
  in `MessageList` and `ConversationSections` instead of reading the wall clock during
  render. Preserve timestamp formatting, the silent midnight refresh, section
  bucketing, default accordion state, and section focus targets. *Done when:* messages
  still change from same-day to dated timestamps after midnight without an
  announcement, conversation sections use the refreshed time bucket, and initial and
  rerendered presentation remains stable.

- [x] **Step 7 - Prove the bounded remediation** - run focused web and browser tests,
  then run candidate Oxc type-aware React Compiler lint only over the ten in-scope
  source files. Review the complete diff and run the repository verification gate.
  *Done when:* the focused tests and `bun run verify` pass; the candidate command
  `bunx oxlint --type-aware --react-plugin --deny react/react-compiler` reports zero
  diagnostics for the scoped source set; and no suppression, configuration,
  dependency, or lockfile change was added.

## Files / areas

- `apps/web/src/components/ConversationView.tsx` and
  `apps/web/src/hooks/focus/useFocusOnCompletion.ts` - completion-focus request and
  acknowledgment ownership.
- `apps/web/src/hooks/shortcuts/useChatHotkeys.ts`,
  `useConversationShortcuts.ts`, and `useGlobalShortcuts.ts` - keyboard binding
  registration and current-value handling.
- `apps/web/src/hooks/conversation/useConversationModel.ts` and
  `useConversationReasoning.ts` - per-conversation override state and persistence
  lifecycle.
- `apps/web/src/hooks/settings/useMidnightRefresh.ts`,
  `apps/web/src/components/message/MessageList.tsx`, and
  `apps/web/src/components/conversations/ConversationSections.tsx` - committed clock
  refresh and presentation.
- Existing focused tests beside the changed hooks and components, including
  `ConversationView.focus.browser.test.tsx`, `useChatHotkeys*.test.tsx`,
  `useConversationShortcuts.test.tsx`, `useGlobalShortcuts.browser.test.tsx`,
  `useConversationModel.test.tsx`, `useConversationReasoning*.test.tsx`,
  `MessageList*.test.tsx`, and `ConversationSections.test.tsx`.

## Data / contracts

- No HTTP, persisted-data, shared-Zod, or client/server contract changes.
- Completion focus is load-bearing: it is requested only after a successful move-mode
  turn, targets the rendered latest assistant heading, and consumes the request once.
- The resolved keymap and notification/diagnostic event payloads remain load-bearing:
  bindings stay rebindable and no conversation title, id, or message content crosses a
  content-safe event boundary.
- Model and reasoning overrides remain load-bearing: local optimistic state, latest
  intent, persisted detail, and the active draft must not overwrite one another.
- The current-time value is presentation-only: it controls relative timestamp and
  bucket calculation, never persisted data or API values.

## Testing

- Extend focused web tests for completion focus, all shortcut paths, fresh rerender
  inputs, model rollback and `beforeSend`, reasoning reseeding and Alt+T behavior, and
  message/section time presentation.
- Retain or extend browser tests for composer-accessible shortcuts, focus completion,
  inline message editing, and screen-reader-safe focus restoration.
- Run the affected tests through the configured `web` and `web-browser` projects, then
  run `bun run verify`.
- Use Oxc's documented `--type-aware --react-plugin --deny react/react-compiler`
  invocation only on the ten source files in scope. The normal lint command remains
  unchanged until feature 7aaf adopts the rule globally.

## Notes for the AI

- This is client-only work. Preserve the thin-client architecture; do not add routes,
  persistence, or shared Contract changes.
- Treat candidate React Compiler diagnostics as lifecycle and ownership risks. Repair
  the state model rather than adding a rule disable, mutation during render, or wider
  ignore pattern.
- Before changing React or `react-hotkeys-hook` APIs, consult their current
  documentation through Context7.
- Preserve WCAG 2.2 AA behavior: semantic controls, visible and predictable focus,
  full keyboard operation, accessible test queries, and the dedicated notification
  system instead of a live region for streamed content.
- Keep content-safe diagnostics intact. Never log message text, conversation identity,
  or secrets.
- Follow named exports, strict TypeScript, TSDoc, and source-size limits.
