import { isRedirect } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDraftStore } from '../stores/draftStore';

// The entry loader imports the singleton queryClient; mock it so the list response is controllable.
const ensureQueryData = vi.fn();
vi.mock('../lib/queryClient', () => ({
  queryClient: { ensureQueryData: () => ensureQueryData() },
}));

import { entryLoader } from './index';

const ID_A = 'aaa-111';
const ID_B = 'bbb-222';

/** Run the loader and return the params of the redirect it throws. */
async function redirectParams(): Promise<{ conversationId: string }> {
  try {
    await entryLoader();
  } catch (thrown) {
    if (isRedirect(thrown)) {
      const { options } = thrown as unknown as {
        options: { to: string; params: { conversationId: string } };
      };
      expect(options.to).toBe('/c/$conversationId');
      return options.params;
    }
    throw thrown;
  }
  throw new Error('entryLoader did not redirect');
}

beforeEach(() => {
  useDraftStore.setState({ draftId: null, draftReasoningOverride: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  ensureQueryData.mockReset();
});

describe('entryLoader redirect', () => {
  it('redirects to the active conversation when it exists in the list', async () => {
    ensureQueryData.mockResolvedValue({
      conversations: [
        { id: ID_B, title: 'B', updatedAt: 2, pinnedAt: null, revision: 1 },
        { id: ID_A, title: 'A', updatedAt: 1, pinnedAt: null, revision: 1 },
      ],
      activeId: ID_A,
    });
    expect((await redirectParams()).conversationId).toBe(ID_A);
  });

  it('self-heals a dangling activeId by redirecting to the most-recent', async () => {
    ensureQueryData.mockResolvedValue({
      conversations: [{ id: ID_B, title: 'B', updatedAt: 2, pinnedAt: null, revision: 1 }],
      activeId: ID_A, // not present in the list
    });
    expect((await redirectParams()).conversationId).toBe(ID_B);
  });

  it('mints a fresh draft id when the list is empty', async () => {
    ensureQueryData.mockResolvedValue({ conversations: [], activeId: null });
    const params = await redirectParams();
    // A real short id draft is minted, recorded as the active draft, and used as the redirect target.
    expect(useDraftStore.getState().draftId).toBe(params.conversationId);
    expect(params.conversationId).toMatch(/^[0-9a-hjkmnp-tv-z]{3}-[0-9a-hjkmnp-tv-z]{3}$/);
  });

  it('redirects to a draft (not a rejection) when the list fetch rejects', async () => {
    ensureQueryData.mockRejectedValue(new Error('network error'));
    // The loader must resolve via a redirect, not propagate the network error.
    const params = await redirectParams();
    expect(params.conversationId).toMatch(/^[0-9a-hjkmnp-tv-z]{3}-[0-9a-hjkmnp-tv-z]{3}$/);
    expect(useDraftStore.getState().draftId).toBe(params.conversationId);
  });

  it('reuses the same draft id across two entry loads with an empty list (stable target)', async () => {
    ensureQueryData.mockResolvedValue({ conversations: [], activeId: null });
    const first = await redirectParams();
    // Do not reset draft store between runs - simulates a second navigation to `/`.
    ensureQueryData.mockResolvedValue({ conversations: [], activeId: null });
    const second = await redirectParams();
    expect(second.conversationId).toBe(first.conversationId);
  });
});
