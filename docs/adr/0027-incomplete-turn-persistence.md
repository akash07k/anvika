# ADR 0027: Incomplete-turn persistence and replay exclusion

Status: accepted. Amends ADR 0022 (which recorded that usage was written only for completed turns).

An errored or aborted chat turn now persists its partial assistant message - the text that
streamed plus any captured usage - marked with a synthesized `incompleteReason` (`'aborted'` or
`'error'`), instead of being discarded. The marked turn is shown in the transcript and survives
reload, but it is deliberately EXCLUDED from the conversation history replayed to the model on later
turns. We made this choice so a user can see what an interrupted turn produced and what
it cost, without a truncated or deliberately-stopped reply silently shaping the next answer.

## Context

ADR 0022 stamped usage metadata only on completed turns; an error kept just the user turn and an
abort kept nothing. But cost is incurred even when a turn errors or is stopped mid-stream, and the
user asked to see the partial reply when that happens. Separately, the AI SDK reports token usage
only at step completion, so a quick error or stop usually exposes no token counts - the partial
TEXT is available, the numbers often are not.

## Decision

- Persist the partial assistant message on `error` and `aborted`, marked with
  `usage.incompleteReason`. The resolved `connectionId:model` id is stamped on the turn when no
  finished step already labelled it, so the readout shows which model was interrupted.
- Empty-turn rule: persist the incomplete turn ONLY when it has streamed text or reported usage;
  a turn that failed before producing anything is not persisted (the live error region already
  announces it).
- Replay exclusion: a persisted incomplete turn is display-only with respect to the model. A pure
  `stripIncompleteTurns` filter removes marked turns from the history sent to the model, while
  persistence and the transcript keep them.
- Usage/cost remain content-safe metadata; no prompt or response text crosses a log boundary.

## Considered Options

- **Usage-only marker, drop the partial text** - rejected. The user explicitly wanted to read the
  partial reply when cost was incurred; recording only numbers hides what was produced.
- **Persist AND replay incomplete turns** - rejected. Feeding a truncated or user-stopped assistant
  message back to the model as context can make it awkwardly continue or be misled by a reply the
  user chose to abandon.
- **Keep ADR 0022's completed-only behavior** - rejected. It loses real incurred cost and the
  partial output for every interrupted turn.

## Consequences

- Reverses the "completed turns only" consequence of ADR 0022; usage metadata can now carry an
  `incompleteReason` and may have no token counts.
- The transcript and the model's context can legitimately differ: an incomplete turn is visible to
  the user but invisible to the model. The `stripIncompleteTurns` step is the single place that
  enforces this, and removing it would silently re-introduce the partial turn into prompts.
- Error-path partial capture is best-effort: whether the SDK preserves the partial assistant message
  on a mid-stream error is provider/timing dependent, pinned by tests; abort-path capture is firm.
