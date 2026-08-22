# Feature: React Compiler chat lifecycle

**From build-plan:** feature 7aab
**Status:** complete

## Goal

Remediate the 15 candidate `react/react-compiler` diagnostics in the chat
lifecycle while preserving streamed-chat request construction, generation
announcements, completion focus, error correlation, and owner-unmount
cancellation.

## In scope

- The two `ConversationView` render-time ref reads: completion-refresh wiring
  and error-correlation display.
- `useChatTransport` ref reads and empty memo dependencies, including its
  transport-identity contract.
- `useAbortOnLeave`, `useGenerationHeartbeat`, and `useOwnerAbortSignal`
  render-time ref reads while preserving their lifecycle guarantees.
- `useChatConflict` and `useChatFinishHandler` mutations of caller-owned refs.
- The narrow `useChatActions` and `ConversationView` interface changes required
  to move chat lifecycle ownership to compiler-safe locations.
- Focused Node, jsdom, and browser tests for affected observable behavior.
- A candidate, type-aware scoped Oxc run using the documented
  `react/react-compiler` rule.

## Out of scope

- Cross-tab diagnostics in `useConversationBroadcast` and
  `useSyncMessagesFromDetail`, owned by feature 7aac.
- Focus, shortcut, conversation-model, reasoning, and presentation diagnostics
  in `useFocusOnCompletion`, shortcut hooks, conversation hooks, `MessageList`,
  and `ConversationSections`, owned by feature 7aad.
- Updating Oxc packages, `.oxlintrc.json`, scripts, or `bun.lock`, enabling
  candidate diagnostics in the normal lint gate, or adding any suppression.
  Feature 7aaf owns the final gate adoption.
- Changes to HTTP routes, shared schemas, persistence, AI SDK versions, or
  user-visible chat controls.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan the current step before changing code.
2. Implement only that step and show its diff.
3. Review the diff and confirm its observable done-when.
4. Obtain approval before moving to the next step or creating an optional
   checkpoint.

## Build steps

- [x] **Step 1 - Make chat transport inputs compiler-safe** - replace
  render-time ref synchronization and the empty `useMemo` dependency set in
  `useChatTransport` with a compiler-compliant transport lifecycle. Update the
  transport tests to prove every send contains the current conversation id,
  revision (including `0`), and model override, while its one transport instance
  reads inputs committed after each render. *Done when:* a rerender with changed
  transport inputs sends the new values without dropping AI SDK envelope fields,
  the transport identity remains stable across rerenders, and candidate lint
  reports no diagnostic for `chatTransport.ts`.

- [x] **Step 2 - Preserve abort and generation lifecycles without render-time
  ref access** - refactor `useAbortOnLeave`, `useGenerationHeartbeat`, and
  `useOwnerAbortSignal` so committed lifecycle state, not render-time ref
  reads, drives cleanup and interval behavior. Add focused coverage for the
  owner signal when its host unmounts. *Done when:* leaving an active chat
  aborts exactly once using the latest stop callback, leaving an idle chat does
  nothing, heartbeat start/progress/thinking/terminal boundaries retain their
  current announcements and timer behavior, an unmounted connection form
  aborts its in-flight test signal, and candidate lint reports no diagnostic in
  the three hooks.

- [x] **Step 3 - Put chat error and completion mutations under local
  ownership** - change `useChatConflict` and `useChatFinishHandler` so neither
  mutates a caller-owned ref. Thread focused callbacks or owned lifecycle state
  through `ConversationView` only where needed, retaining single-source error
  announcements, revision refresh, and move-on-completion focus arming. *Done
  when:* repeated renders of one generic error announce and report it once, a
  conflict still refreshes and announces without stealing focus, a successful
  completion refreshes the next-send revision and arms focus only in `move`
  mode, and candidate lint reports no diagnostic in either hook.

- [x] **Step 4 - Remove ConversationView render-time ref reads** - adapt
  `ConversationView` and its action wiring to provide completion refresh and
  request-id display through compiler-safe state or callbacks rather than
  reading or assigning refs during render. Preserve existing request-id
  propagation, Stop and Retry focus return, and the non-live accessible error
  path. *Done when:* a send's exact correlation id is shown to the error path
  and used in its diagnostic, Stop and Retry return focus to the composer,
  completion focus remains stable in Chromium, and candidate lint reports no
  diagnostic for `ConversationView.tsx`.

- [x] **Step 5 - Prove the bounded remediation** - run the focused affected
  tests, then run the candidate Oxc rule with `--type-aware`,
  `--react-plugin`, and `--deny react/react-compiler` against the seven
  in-scope source files. Review the full diff and run the repository verification
  gate. *Done when:* focused tests pass, the scoped candidate command reports
  zero diagnostics for all 15 in-scope findings, `bun run verify` passes, and
  no lint suppression, Oxc configuration, dependency, or lockfile change was
  added.

- [x] **Repair - Preserve lifecycle behavior through the StrictMode probe** -
  ensure the development-only effect setup-cleanup-setup sequence neither aborts
  an initially active chat nor repeats generation-start and thinking
  announcements, while a real unmount still aborts the latest active turn.
  Extend request-id action tests to prove retry, per-message regenerate, and
  edit publish the exact ID attached to their request header. *Done when:*
  StrictMode tests prove one initial announcement and no probe abort, final
  unmount aborts exactly once with the latest stop callback, each
  generation-starting action reports its own sent request ID, and the scoped
  compiler check plus repository verification gate pass.

## Files / areas

- `apps/web/src/hooks/chat/chatTransport.ts` and
  `apps/web/src/hooks/chat/chatTransport.test.tsx` - request transport inputs
  and transport identity.
- `apps/web/src/hooks/chat/useAbortOnLeave.ts` and
  `apps/web/src/hooks/chat/useAbortOnLeave.test.ts` - active-turn abort on
  unmount.
- `apps/web/src/hooks/chat/useGenerationHeartbeat.ts` and
  `apps/web/src/hooks/chat/useGenerationHeartbeat.test.tsx` - generation and
  thinking announcements.
- `apps/web/src/hooks/chat/useOwnerAbortSignal.ts` and a focused colocated test
  - owner-lifetime cancellation for connection testing.
- `apps/web/src/hooks/chat/useChatConflict.ts` and
  `apps/web/src/hooks/chat/useChatConflict.test.tsx` - generic-error
  deduplication, conflict handling, and post-turn refresh.
- `apps/web/src/hooks/chat/useChatFinishHandler.ts` - terminal chat event
  handling and completion-focus request.
- `apps/web/src/hooks/chat/useChatActions.ts` - narrow request-id lifecycle
  interface required by `ConversationView`.
- `apps/web/src/components/ConversationView.tsx`,
  `ConversationView.test.tsx`, `ConversationView.streaming.test.tsx`, and
  `ConversationView.focus.browser.test.tsx` - composition, correlation, and
  accessible focus behavior.

## Data / contracts

- No HTTP, persisted-data, shared-Zod, or client/server contract changes.
- The chat request body remains load-bearing: preserve the AI SDK envelope
  fields and conditionally include `conversationId`, numeric `baseRevision`
  (including `0`), and non-empty `modelId`.
- The transport identity remains load-bearing while the chat id is unchanged:
  AI SDK v6 retains its `Chat` instance for that id, so the stable transport
  must read the latest committed request inputs rather than be recreated.
- The active turn's correlation id remains load-bearing: the id sent in the
  request header is the id included in a later generic-error diagnostic and
  rendered error context.
- Lifecycle behavior is load-bearing: active unmounts stop the current turn,
  idle unmounts do not stop, and a completion refreshes the revision before the
  next turn.
- Accessibility behavior is load-bearing: completion focus moves only when
  configured, Stop and Retry return to the composer, generic errors use the
  notification path rather than a live error region, and conflict handling does
  not steal focus.

## Testing

- Extend `chatTransport.test.tsx` for changed and unchanged transport inputs,
  preserving request body and identity guarantees.
- Keep and extend hook tests for abort transitions, heartbeat phase
  announcements, owner-signal aborts, conflict deduplication, and post-finish
  refresh behavior.
- Keep `ConversationView` tests for request-id correlation, Stop and Retry
  focus, and terminal events; retain the existing browser test for stable
  completion focus.
- Run the focused tests through the configured Node, web, and web-browser
  projects, then run `bun run verify`.
- Run the candidate Oxc command only over the seven in-scope sources. The
  normal lint command intentionally remains unchanged until feature 7aaf.

## Notes for the AI

- This is client-only lifecycle work. Preserve the thin-client architecture and
  do not introduce routes, storage, or contract changes.
- Treat candidate React Compiler diagnostics as behavior risks. Repair
  ownership, lifecycle, or memoization rather than adding a disable, weakening
  a rule, or widening an ignore pattern.
- Consult current AI SDK and React documentation through Context7 before
  changing `useChat`, `DefaultChatTransport`, or React lifecycle APIs.
- Preserve content-safe diagnostic logging. Never log message text or secrets
  outside the established explicit content-logging policy.
- Keep WCAG 2.2 AA behavior explicit in tests: use accessible queries, preserve
  predictable keyboard focus, and do not introduce a live region for streamed
  chat text.
- Follow named exports, strict TypeScript, TSDoc, source-size limits, and the
  existing focused-hook patterns.
