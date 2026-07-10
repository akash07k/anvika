import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';

import { reportClientError } from '../../diagnostics/reportClientError';
import { createModelOverrideWriter } from '../../lib/models/modelOverrideWriter';
import { renameConversation } from '../../lib/conversation/conversationMutations';
import {
  useConversationList,
  invalidateConversation,
} from '../../lib/conversation/conversationQueries';
import { navigateToConversationAndFocusComposer } from '../../lib/conversation/navigateToConversation';
import { notify } from '../../notifications/notifier';
import { useDraftStore } from '../../stores/draftStore';

/** Options for the advanced create action. */
export interface AdvancedCreateOptions {
  /** The conversation title (trimmed inside; empty string means no title). */
  title: string;
  /** A concrete namespaced model id, or `null` to inherit the default. */
  model: string | null;
}

/** Return type of {@link useAdvancedNewConversation}. */
export interface AdvancedNewConversation {
  /**
   * Create a draft with an optional title and model, navigate to it, focus the composer, and
   * durably persist a non-default title/model. When both title and model are absent/default this
   * is a pure draft identical to the plain New conversation action.
   */
  create: (options: AdvancedCreateOptions) => void;
}

/**
 * The create action for the advanced new-conversation dialog: mints a draft, seeds the draft
 * store optimistically (so the conversation header shows the choice on arrival before the row is
 * fetched), navigates to the new conversation with the composer focused, announces the creation,
 * and fires a non-blocking durable persist when a title or model was actually chosen.
 *
 * Persist order matters: {@link createModelOverrideWriter}.write runs FIRST (create-if-absent: it
 * creates the row AND sets model_id), then {@link renameConversation} applies the title (the row
 * now exists, so the PATCH 404s are avoided). A failure in either write is swallowed (non-fatal):
 * the draft store already shows the choice, and the first turn reconciles the persisted state.
 *
 * @returns The advanced create action object.
 */
export function useAdvancedNewConversation(): AdvancedNewConversation {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useConversationList();

  const create = useCallback(
    ({ title, model }: AdvancedCreateOptions) => {
      const takenIds = new Set((data?.conversations ?? []).map((s) => s.id));
      const id = useDraftStore.getState().newDraft(takenIds);
      const trimmed = title.trim();

      // Optimistic seed: the conversation header reads these before the row is fetched.
      useDraftStore.getState().setDraftModel(model);
      useDraftStore.getState().setDraftTitle(trimmed || null);

      navigateToConversationAndFocusComposer(navigate, id);
      notify({ type: 'conversationCreated' });

      // Durable persist - only when a setting was actually chosen.
      if (trimmed || model !== null) {
        const persist = async (): Promise<void> => {
          try {
            // write first: create-if-absent creates the row + sets model_id (null = inherit).
            await createModelOverrideWriter(id).write(model);
            if (trimmed) await renameConversation(id, trimmed);
            // Refresh detail + list so the new row appears in the nav.
            invalidateConversation(queryClient, id);
          } catch (err) {
            // Non-fatal for the session: the draft store still shows the chosen title/model until
            // reload, and the chosen model still rides the transport on the first turn. But a failed
            // persist is NOT reconciled on reload - the override row was never written, and the server
            // derives the title from the first message, so a failed rename loses the chosen title. So
            // we do not swallow it silently: emit a content-safe diagnostic (error name/code only,
            // never the title or model text).
            reportClientError(err, '');
          }
        };
        void persist();
      }
    },
    [data, navigate, queryClient],
  );

  return { create };
}
