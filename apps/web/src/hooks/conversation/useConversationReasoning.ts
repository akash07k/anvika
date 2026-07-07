import { useCallback, useEffect, useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { ReasoningEffortOverride } from '@anvika/shared/reasoning/effort';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

import {
  invalidateConversation,
  useConversationDetail,
} from '../../lib/conversation/conversationQueries';
import {
  baselineEffort,
  createReasoningOverrideWriter,
  toggleDecision,
  type ReasoningOverrideWriter,
} from '../../lib/message/reasoning';
import { useModels } from './useModels';
import { notify } from '../../notifications/notifier';

/** What the conversation surface needs to render the effort control and gate sends. */
export interface ConversationReasoning {
  /** The current override the control mirrors (`inherit` until the user overrides). */
  override: ReasoningEffortOverride;
  /** Whether the active model can reason (drives the control's disabled state). */
  capable: boolean;
  /** Optimistically set the override and persist it (a write to the id-scoped override endpoint). */
  onEffortChange: (next: ReasoningEffortOverride) => void;
  /** Awaited by the send path so an in-flight override write lands before the chat send. */
  beforeSend: () => Promise<void>;
  /**
   * Alt+T handler: toggles thinking on/off using the three-case rule (effectively on -> off;
   * off with on baseline -> inherit; both off -> medium), persists the change, and announces the
   * resolved effort. The announcement is ONLY here (never on `onEffortChange`), so a native select
   * change is not double-spoken by the screen reader.
   */
  onToggleThinking: () => void;
}

/** A writer whose `write` resolves to a no-op - used for an ephemeral surface with no persistent id. */
const NOOP_WRITER: ReasoningOverrideWriter = {
  write: () => Promise.resolve(),
  pending: () => Promise.resolve(),
};

/**
 * Seeds the override from the id-scoped conversation detail, derives capability from the active
 * model, persists changes optimistically via a writer that lives OUTSIDE the settings single-flight
 * queue, and exposes a `beforeSend` gate the send path awaits. Also exposes `onToggleThinking` for
 * Alt+T.
 *
 * When `conversationId` is undefined (an ephemeral surface with no persistent target), the control
 * still renders and the toggle still updates local state, but the write is a no-op (there is no row
 * to persist to). A defined id builds a writer at `PATCH /api/v1/conversations/:id/reasoning`, which
 * create-if-absents the row; on a successful write the id-scoped detail and the list are invalidated
 * so a just-created draft is reflected (the detail refetches the now-existing row; the list shows the
 * new entry). A draft id whose detail resolves to `null` (a not-found 404, the expected empty state)
 * seeds the override to null (inherit). Unlike the model hook, this seed is deliberately NOT draft-store
 * backed: the advanced new-conversation dialog pre-selects a model only (the draft store carries
 * `draftModelId`, not a reasoning override), so there is no pre-send reasoning choice to restore here.
 *
 * @param conversationId - The active conversation id, or `undefined` for an ephemeral turn.
 * @param settings - The current redacted settings (selectedModelId, connections, reasoningEffort).
 * @returns See {@link ConversationReasoning}.
 */
export function useConversationReasoning(
  conversationId: string | undefined,
  settings: RedactedSettings | null,
): ConversationReasoning {
  const detail = useConversationDetail(conversationId);
  const loadedOverride = detail.data?.reasoningOverride ?? null;
  const [override, setOverride] = useState<ReasoningEffortOverride>(loadedOverride ?? 'inherit');
  // Re-seed when the persisted override changes (e.g. after a remote refetch). The optimistic local
  // state may briefly revert if a refetch resolves before the PATCH settles; beforeSend guarantees the
  // write lands before any chat send, so this brief revert is acceptable for a single-user surface.
  useEffect(() => {
    setOverride(loadedOverride ?? 'inherit');
    return undefined;
  }, [loadedOverride]);

  const selectedModelId = settings?.selectedModelId;
  const models = useModels();
  const capable =
    models.data?.find((m) => m.id === selectedModelId)?.capabilities.reasoning ?? false;

  const queryClient = useQueryClient();
  const writer = useMemo(
    () => (conversationId ? createReasoningOverrideWriter(conversationId) : NOOP_WRITER),
    [conversationId],
  );
  const onEffortChange = useCallback(
    (next: ReasoningEffortOverride) => {
      setOverride(next); // optimistic
      writer
        .write(next === 'inherit' ? null : next)
        .then(() => {
          // The write may have create-if-absented the row: refetch the now-existing detail and
          // refresh the list so a just-created draft entry appears. No-op for the ephemeral writer.
          if (conversationId) invalidateConversation(queryClient, conversationId);
          return undefined;
        })
        .catch(() => notify({ type: 'reasoningOverrideSaveFailed' }));
    },
    [writer, conversationId, queryClient],
  );
  const beforeSend = useCallback(() => writer.pending(), [writer]);

  const onToggleThinking = useCallback(() => {
    const { next, announced } = toggleDecision(override, baselineEffort(settings));
    onEffortChange(next);
    notify({ type: 'reasoningEffortChanged', effort: announced });
  }, [override, settings, onEffortChange]);

  return { override, capable, onEffortChange, beforeSend, onToggleThinking };
}
