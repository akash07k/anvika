import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import {
  invalidateConversation,
  useConversationDetail,
} from '../../lib/conversation/conversationQueries';
import {
  createModelOverrideWriter,
  type ModelOverrideWriter,
} from '../../lib/models/modelOverrideWriter';
import { notify } from '../../notifications/notifier';
import { useDraftStore } from '../../stores/draftStore';

/** What the conversation surface needs to render the model control and gate sends. */
export interface ConversationModel {
  /** The per-conversation model override the control mirrors, or `null` to inherit the default. */
  modelId: string | null;
  /**
   * Optimistically set the override and persist it (a write to the id-scoped `/model` endpoint).
   * Resolves to `true` when the write succeeds and `false` when it fails. On failure the optimistic
   * selection is ROLLED BACK (so the control and the transport's model ref never keep showing/sending
   * a model that was never persisted) and `modelOverrideSaveFailed` is announced here; the caller
   * announces success only on `true`, so a screen-reader user never hears a contradictory "Model set
   * to X" followed by "Could not change the model".
   */
  onModelChange: (next: string | null) => Promise<boolean>;
  /** Awaited by the send path so an in-flight override write lands before the chat send. */
  beforeSend: () => Promise<void>;
}

/** A writer whose `write` resolves to a no-op - used for an ephemeral surface with no persistent id. */
const NOOP_WRITER: ModelOverrideWriter = {
  write: () => Promise.resolve(),
  pending: () => Promise.resolve(),
};

/**
 * Seeds the model override from the id-scoped conversation detail (or the draft store for an unsaved
 * draft, so the advanced new-conversation dialog's pre-selected model shows in the header), persists
 * changes optimistically via a writer that lives OUTSIDE the settings single-flight queue, and exposes
 * a `beforeSend` gate the send path awaits. `null` means inherit the default model.
 *
 * When `conversationId` is undefined (an ephemeral surface with no persistent target), the control
 * still renders and the change still updates local state, but the write is a no-op (there is no row to
 * persist to). A defined id builds a writer at `PATCH /api/v1/conversations/:id/model`, which
 * create-if-absents the row; on a successful write the id-scoped detail and the list are invalidated so
 * a just-created draft is reflected. For an unsaved draft the change also syncs the draft store so the
 * choice survives until the first turn.
 *
 * @param conversationId - The active conversation id, or `undefined` for an ephemeral turn.
 * @returns See {@link ConversationModel}.
 */
export function useConversationModel(conversationId: string | undefined): ConversationModel {
  const detail = useConversationDetail(conversationId);
  const draftId = useDraftStore((s) => s.draftId);
  const draftModelId = useDraftStore((s) => s.draftModelId);
  // A real row's persisted override wins. Otherwise fall back to the draft store ONLY when this id is
  // the ACTIVE draft (mirrors the `draftId === conversationId` guard the header title uses in
  // ConversationView): `clearDraft` is never called in production, so a leftover `draftModelId` could
  // otherwise leak into an unrelated conversation that merely has no persisted row yet.
  const hasRow = detail.data != null;
  const isActiveDraft = !hasRow && conversationId !== undefined && draftId === conversationId;
  const seededModelId = hasRow
    ? (detail.data?.modelId ?? null)
    : isActiveDraft
      ? draftModelId
      : null;
  const [modelId, setModelId] = useState<string | null>(seededModelId);
  // The last COMMITTED displayed value (updated every render) - the target a failed write rolls back
  // to. Distinct from the request ref below because a write's catch can run before React commits the
  // optimistic render, so this ref must not be used to detect a superseding pick.
  const modelIdRef = useRef(modelId);
  modelIdRef.current = modelId;
  // The latest INTENDED value, set synchronously in `onModelChange` (before the async write). The
  // catch compares against it to roll back ONLY when no newer pick has since superseded this request.
  const latestRequestRef = useRef<string | null>(modelId);
  // Re-seed when the persisted or draft value changes (e.g. after the create-if-absent write refetch).
  // The optimistic local state may briefly revert if a refetch resolves before the PATCH settles;
  // beforeSend guarantees the write lands before any chat send, so the brief revert is acceptable.
  useEffect(() => {
    setModelId(seededModelId);
    return undefined;
  }, [seededModelId]);

  const queryClient = useQueryClient();
  const writer = useMemo(
    () => (conversationId ? createModelOverrideWriter(conversationId) : NOOP_WRITER),
    [conversationId],
  );
  const onModelChange = useCallback(
    (next: string | null): Promise<boolean> => {
      const previous = modelIdRef.current; // the displayed value to roll back to if the write fails
      latestRequestRef.current = next; // record the intent synchronously for the supersede guard
      setModelId(next); // optimistic
      // Keep the draft store in sync for the ACTIVE draft so the choice survives until the first turn.
      if (isActiveDraft) useDraftStore.getState().setDraftModel(next);
      return writer
        .write(next)
        .then(() => {
          // The write may have create-if-absented the row: refetch the now-existing detail and refresh
          // the list so a just-created draft entry appears. No-op for the ephemeral writer.
          if (conversationId) invalidateConversation(queryClient, conversationId);
          return true;
        })
        .catch(() => {
          // Roll back the optimistic selection so the control and the transport's model ref stop
          // showing/sending a model that was never persisted - unless a newer pick already superseded
          // this one (then the newer value stands and owns its own rollback).
          if (latestRequestRef.current === next) {
            latestRequestRef.current = previous;
            setModelId(previous);
            if (isActiveDraft) useDraftStore.getState().setDraftModel(previous);
          }
          notify({ type: 'modelOverrideSaveFailed' });
          return false;
        });
    },
    [writer, conversationId, isActiveDraft, queryClient],
  );
  const beforeSend = useCallback(() => writer.pending(), [writer]);

  return { modelId, onModelChange, beforeSend };
}
