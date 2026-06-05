import { beforeEach, describe, expect, it } from 'vitest';

import { isConversationId } from '@anvika/shared/conversation/id';
import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

import { useDraftStore } from './draftStore';

/** An empty taken-ids set; most tests mint without an existing conversation list. */
const NO_TAKEN: ReadonlySet<string> = new Set();

/** Reset the draft store to a clean slate before every test so tests are isolated. */
function resetStore(): void {
  useDraftStore.setState({
    draftId: null,
    draftReasoningOverride: null,
    draftModelId: null,
    draftTitle: null,
  });
}

beforeEach(() => {
  resetStore();
});

describe('draftStore', () => {
  it('newDraft() mints a short id, stores the draft id, and clears the reasoning override', () => {
    const id = useDraftStore.getState().newDraft(NO_TAKEN);
    const state = useDraftStore.getState();
    expect(state.draftId).toBe(id);
    expect(isConversationId(id)).toBe(true);
    expect(state.draftReasoningOverride).toBeNull();
  });

  it('newDraft() avoids ids already in the taken set', () => {
    const id = useDraftStore.getState().newDraft(NO_TAKEN);
    const second = useDraftStore.getState().newDraft(new Set([id]));
    expect(second).not.toBe(id);
    expect(isConversationId(second)).toBe(true);
  });

  it('setDraftReasoning() updates draftReasoningOverride; null clears it', () => {
    useDraftStore.getState().newDraft(NO_TAKEN);
    useDraftStore.getState().setDraftReasoning('high');
    expect(useDraftStore.getState().draftReasoningOverride).toBe<ReasoningEffort>('high');
    useDraftStore.getState().setDraftReasoning(null);
    expect(useDraftStore.getState().draftReasoningOverride).toBeNull();
  });

  it('clearDraft() sets draftId and draftReasoningOverride to null', () => {
    useDraftStore.getState().newDraft(NO_TAKEN);
    useDraftStore.getState().setDraftReasoning('medium');
    useDraftStore.getState().clearDraft();
    const state = useDraftStore.getState();
    expect(state.draftId).toBeNull();
    expect(state.draftReasoningOverride).toBeNull();
  });

  it('newDraft() replaces the existing draft: new id differs and reasoning override resets', () => {
    const firstId = useDraftStore.getState().newDraft(NO_TAKEN);
    useDraftStore.getState().setDraftReasoning('low');
    const secondId = useDraftStore.getState().newDraft(new Set([firstId]));
    expect(secondId).not.toBe(firstId);
    expect(isConversationId(secondId)).toBe(true);
    expect(useDraftStore.getState().draftReasoningOverride).toBeNull();
  });

  it('newDraft() clears draftModelId and draftTitle', () => {
    const state = useDraftStore.getState();
    state.newDraft(NO_TAKEN);
    expect(useDraftStore.getState().draftModelId).toBeNull();
    expect(useDraftStore.getState().draftTitle).toBeNull();
  });

  it('setDraftModel() updates draftModelId; null clears it', () => {
    useDraftStore.getState().newDraft(NO_TAKEN);
    useDraftStore.getState().setDraftModel('openai:gpt-4o');
    expect(useDraftStore.getState().draftModelId).toBe('openai:gpt-4o');
    useDraftStore.getState().setDraftModel(null);
    expect(useDraftStore.getState().draftModelId).toBeNull();
  });

  it('setDraftTitle() updates draftTitle; null clears it', () => {
    useDraftStore.getState().newDraft(NO_TAKEN);
    useDraftStore.getState().setDraftTitle('My plan');
    expect(useDraftStore.getState().draftTitle).toBe('My plan');
    useDraftStore.getState().setDraftTitle(null);
    expect(useDraftStore.getState().draftTitle).toBeNull();
  });

  it('newDraft() replaces the existing draft: model and title reset alongside reasoning', () => {
    const firstId = useDraftStore.getState().newDraft(NO_TAKEN);
    useDraftStore.getState().setDraftModel('openai:gpt-4o');
    useDraftStore.getState().setDraftTitle('My plan');
    const secondId = useDraftStore.getState().newDraft(new Set([firstId]));
    expect(secondId).not.toBe(firstId);
    expect(useDraftStore.getState().draftModelId).toBeNull();
    expect(useDraftStore.getState().draftTitle).toBeNull();
  });

  it('clearDraft() also resets draftModelId and draftTitle', () => {
    useDraftStore.getState().newDraft(NO_TAKEN);
    useDraftStore.getState().setDraftModel('openai:gpt-4o');
    useDraftStore.getState().setDraftTitle('My plan');
    useDraftStore.getState().clearDraft();
    expect(useDraftStore.getState().draftModelId).toBeNull();
    expect(useDraftStore.getState().draftTitle).toBeNull();
  });
});
