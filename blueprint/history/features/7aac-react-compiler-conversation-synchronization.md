# Feature: React Compiler conversation synchronization

**From build-plan:** feature 7aac
**Status:** ready for completion

## Goal

Remediate React Compiler ref and synchronization diagnostics in the cross-tab
conversation hooks without changing cross-tab event semantics, transcript
reconciliation, focus recovery, or content-safe announcements.

## In scope

- Compiler-safe latest-value handling in `useConversationBroadcast` while one
  cross-tab subscription remains active for the hook lifetime.
- Compiler-safe revision and transcript reconciliation in
  `useSyncMessagesFromDetail`.
- Focused hook tests that prove fresh rerender inputs, deferred idle
  reconciliation, remote-update announcements, and focus recovery.
- A candidate, type-aware scoped Oxc run using the documented
  `react/react-compiler` rule.

## Out of scope

- Changes to BroadcastChannel schema parsing, ownership, lifecycle, or
  content-safe payload design in `conversationsBroadcast.ts`.
- Navigation, shortcut, focus, reasoning, conversation-model, and presentation
  diagnostics owned by feature 7aad.
- Updating Oxc packages, `.oxlintrc.json`, scripts, or `bun.lock`, enabling
  candidate diagnostics in the normal lint gate, or adding a suppression.
  Feature 7aaf owns the final lint-gate adoption.
- Changes to HTTP routes, shared schemas, persistence, AI SDK behavior, or
  user-visible chat controls.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan the current step before changing code.
2. Implement only that step and show its diff.
3. Review the diff and confirm its observable done-when.
4. Obtain approval before moving to the next step or creating an optional
   checkpoint.

## Build steps

- [x] **Step 1 - Make the cross-tab broadcast subscriber compiler-safe** -
  replace render-time synchronization of the viewed conversation, busy state,
  and deletion callback with a documented React lifecycle pattern. Preserve one
  subscription for the mounted hook and make its handler observe the latest
  committed values. Extend focused tests for changed `viewedId`, `isBusy`, and
  deletion callback inputs. *Done when:* `list-changed`, remote update, and
  remote deletion events retain their current cache and callback behavior after
  a rerender; exactly one subscription is created until unmount; and candidate
  lint reports no diagnostic for `useConversationBroadcast.ts`.

- [x] **Step 2 - Make transcript reconciliation compiler-safe** - move
  revision and latest-input synchronization out of render while retaining
  authoritative-detail reconciliation. Extend the hook tests for current
  message and setter inputs after rerender, idle deferral after busy or editing
  states, remote text edits and truncation, the exactly-once announcement, and
  focus capture and restoration. *Done when:* an unchanged or own-turn
  transcript is adopted silently, a differing remote transcript re-seeds and
  announces once only after the hook is idle, and candidate lint reports no
  diagnostic for `useSyncMessagesFromDetail.ts`.

- [x] **Step 3 - Prove the bounded remediation** - run the focused cross-tab
  hook tests, then run the candidate Oxc rule with `--type-aware`,
  `--react-plugin`, and `--deny react/react-compiler` against the two in-scope
  source files. Review the full diff and run the repository verification gate.
  *Done when:* focused tests pass, the scoped candidate command reports zero
  diagnostics for both in-scope files, `bun run verify` passes, and no lint
  suppression, Oxc configuration, dependency, or lockfile change was added.

- [x] **Repair - Cover StrictMode and changed conversation IDs** - add focused
  regression tests for the cross-tab effect lifecycle and transcript
  reconciliation under React StrictMode, and confirm an existing broadcast
  handler ignores an event for the old conversation ID after rerendering to a
  new one. *Done when:* StrictMode leaves one active broadcast subscription and
  applies a remote revision once, old-ID events do not invalidate the current
  detail, and the focused tests and full verification gate pass.

## Files / areas

- `apps/web/src/hooks/crosstab/useConversationBroadcast.ts` and
  `useConversationBroadcast.test.tsx` - long-lived broadcast subscription and
  latest event handling.
- `apps/web/src/hooks/crosstab/useSyncMessagesFromDetail.ts` and
  `useSyncMessagesFromDetail.test.tsx` - revision-gated transcript
  reconciliation and accessibility-preserving re-seed behavior.

## Data / contracts

- No HTTP, persisted-data, shared-Zod, or client/server contract changes.
- The `ConversationBroadcastEvent` schema and content-safe payload contract are
  load-bearing and remain unchanged.
- A remote `conversation-updated` invalidates only the idle, viewed
  conversation detail; a remote deletion calls the current surface callback
  only for the viewed conversation.
- Revision gating is load-bearing: each new authoritative revision is adopted
  once, own-turn matches never announce, and remote divergence re-seeds the
  latest transcript after busy and editing states clear.
- Accessibility behavior is load-bearing: remote updates use the established
  notification event rather than a live chat region, and a truncating re-seed
  preserves focus or restores it to a valid message heading.

## Testing

- Extend the web-project hook tests beside each changed hook. Cover fresh
  values after rerender, subscription cleanup, query invalidation, deletion
  callback freshness, revision gating, remote divergence, deferred
  reconciliation, notification cardinality, and focus-recovery calls.
- Run the focused tests through the configured web project, then run
  `bun run verify`.
- Run the candidate Oxc command only over the two in-scope sources. The normal
  lint command intentionally remains unchanged until feature 7aaf.

## Notes for the AI

- This is client-only synchronization work. Preserve the thin-client
  architecture and do not introduce routes, storage, or contract changes.
- Use the React 19.2 documented lifecycle approach for current values in a
  long-lived effect, such as an effect event where appropriate. Do not replace
  the diagnostics with render-time ref writes, rule disables, or widened ignore
  patterns.
- Keep the BroadcastChannel boundary validation and content-safe diagnostics
  unchanged. Never log message text or secrets outside the established explicit
  content-logging policy.
- Keep WCAG 2.2 AA behavior explicit in tests: preserve focus recovery and use
  the notification system, not a live region, for remote conversation updates.
- Follow named exports, strict TypeScript, TSDoc, source-size limits, and the
  existing focused-hook patterns.
