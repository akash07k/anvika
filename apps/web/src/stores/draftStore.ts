import { mintConversationId } from '@anvika/shared/conversation/id';
import { create } from 'zustand';

import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

/**
 * The client-side state for the single current conversation draft.
 *
 * A draft is a UI-only conversation that has no server row yet; the row is created
 * lazily on the first message sent or first per-conversation setting change. Exactly
 * one draft exists at a time (or none, when `draftId` is `null`). Conversation ids are
 * client-minted short `xxx-xxx` Crockford base32 values.
 */
export interface DraftState {
  /** The single current draft's `xxx-xxx` conversation id, or `null` when no draft exists. */
  draftId: string | null;

  /**
   * The reasoning effort override held on the current draft (`null` means no override
   * has been set yet). Holds a concrete {@link ReasoningEffort} value - never `'inherit'`.
   */
  draftReasoningOverride: ReasoningEffort | null;

  /**
   * The model override held on the current draft (`null` means inherit the default model).
   * A namespaced `connectionId:model` id, matching the conversation `modelId` contract.
   */
  draftModelId: string | null;

  /**
   * The title held on the current draft (`null` means none chosen yet, so the title is
   * derived from the first message). Set by the advanced new-conversation dialog.
   */
  draftTitle: string | null;

  /**
   * Mint a fresh `xxx-xxx` id that avoids every id in `takenIds`, replace any existing draft
   * (resetting the reasoning override, model override, and title to `null`), and return the new
   * id. The caller passes the complete set of existing conversation ids, making the uniqueness
   * check exhaustive.
   *
   * @param takenIds - The set of existing conversation ids the new draft id must avoid.
   * @returns The newly minted conversation id.
   */
  newDraft(takenIds: ReadonlySet<string>): string;

  /**
   * Set the reasoning effort override on the current draft. Pass `null` to clear the
   * override (the conversation will inherit the cascade default at send time).
   *
   * @param value - The effort to hold, or `null` to clear.
   */
  setDraftReasoning(value: ReasoningEffort | null): void;

  /**
   * Set the model override on the current draft. Pass `null` to clear it (the conversation
   * will inherit the default model at send time).
   *
   * @param value - The namespaced model id to hold, or `null` to inherit the default.
   */
  setDraftModel(value: string | null): void;

  /**
   * Set the title on the current draft. Pass `null` to clear it (the title will be derived
   * from the first message instead).
   *
   * @param value - The title to hold, or `null` to clear.
   */
  setDraftTitle(value: string | null): void;

  /**
   * Remove the current draft, resetting `draftId`, `draftReasoningOverride`, `draftModelId`, and
   * `draftTitle` to `null`. Called after the draft is promoted to a persisted conversation or
   * discarded.
   */
  clearDraft(): void;
}

/** Holds the single in-flight conversation draft; read by the chat composer and conversation list. */
export const useDraftStore = create<DraftState>((set) => ({
  draftId: null,
  draftReasoningOverride: null,
  draftModelId: null,
  draftTitle: null,

  newDraft(takenIds: ReadonlySet<string>): string {
    const id = mintConversationId(takenIds);
    set({ draftId: id, draftReasoningOverride: null, draftModelId: null, draftTitle: null });
    return id;
  },

  setDraftReasoning(value: ReasoningEffort | null): void {
    set({ draftReasoningOverride: value });
  },

  setDraftModel(value: string | null): void {
    set({ draftModelId: value });
  },

  setDraftTitle(value: string | null): void {
    set({ draftTitle: value });
  },

  clearDraft(): void {
    set({ draftId: null, draftReasoningOverride: null, draftModelId: null, draftTitle: null });
  },
}));
