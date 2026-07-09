import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../api-client';
import * as apiClient from '../api-client';
import {
  batchDeleteConversations,
  branchConversation,
  deleteConversation,
  onConversationConflict,
  renameConversation,
  retitleConversation,
  setActiveConversation,
  setPinnedConversation,
} from './conversationMutations';

afterEach(() => {
  vi.restoreAllMocks();
});

const ID_A = 'aaa-111';
const ID_B = 'bbb-222';

describe('renameConversation', () => {
  it('PATCHes the title to /api/v1/conversations/:id and resolves void', async () => {
    const spy = vi.spyOn(apiClient, 'apiPatchNoContent').mockResolvedValue(undefined);
    await expect(renameConversation(ID_A, 'New title')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(`/api/v1/conversations/${ID_A}`, { title: 'New title' });
  });
});

describe('deleteConversation', () => {
  it('DELETEs /api/v1/conversations/:id and returns the validated activeId', async () => {
    const spy = vi.spyOn(apiClient, 'apiDelete').mockResolvedValue({ activeId: ID_B } as never);
    await expect(deleteConversation(ID_A)).resolves.toEqual({ activeId: ID_B });
    expect(spy).toHaveBeenCalledWith(`/api/v1/conversations/${ID_A}`, expect.anything());
  });
});

describe('batchDeleteConversations', () => {
  it('POSTs the ids to delete-batch and returns the validated result', async () => {
    const spy = vi
      .spyOn(apiClient, 'apiPost')
      .mockResolvedValue({ deleted: 2, activeId: null } as never);
    await expect(batchDeleteConversations([ID_A, ID_B])).resolves.toEqual({
      deleted: 2,
      activeId: null,
    });
    expect(spy).toHaveBeenCalledWith(
      '/api/v1/conversations/delete-batch',
      { ids: [ID_A, ID_B] },
      expect.anything(),
    );
  });
});

describe('branchConversation', () => {
  const SUMMARY = {
    id: ID_B,
    title: 'Branched',
    updatedAt: 1000,
    pinnedAt: null,
    revision: 0,
  };

  it('POSTs { newId, baseRevision } to /:id/branch and returns the validated summary', async () => {
    const spy = vi.spyOn(apiClient, 'apiPost').mockResolvedValue(SUMMARY as never);
    await expect(branchConversation(ID_A, ID_B, 3)).resolves.toEqual(SUMMARY);
    expect(spy).toHaveBeenCalledWith(
      `/api/v1/conversations/${ID_A}/branch`,
      { newId: ID_B, baseRevision: 3 },
      expect.anything(),
    );
  });

  it('includes throughIndex in the body only when it is provided', async () => {
    const spy = vi.spyOn(apiClient, 'apiPost').mockResolvedValue(SUMMARY as never);
    await branchConversation(ID_A, ID_B, 3, 2);
    expect(spy).toHaveBeenCalledWith(
      `/api/v1/conversations/${ID_A}/branch`,
      { newId: ID_B, baseRevision: 3, throughIndex: 2 },
      expect.anything(),
    );
  });

  it('rejects with the ApiClientError when the response is not ok', async () => {
    const err = new ApiClientError('conflict', 'changed elsewhere', undefined);
    vi.spyOn(apiClient, 'apiPost').mockRejectedValue(err);
    await expect(branchConversation(ID_A, ID_B, 3)).rejects.toBe(err);
  });
});

describe('setActiveConversation', () => {
  it('PUTs the id to /api/v1/conversations/active and resolves void', async () => {
    const spy = vi.spyOn(apiClient, 'apiPut').mockResolvedValue(undefined);
    await expect(setActiveConversation(ID_A)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith('/api/v1/conversations/active', { id: ID_A });
  });
});

describe('setPinnedConversation', () => {
  it('PUTs { pinned: true } to /api/v1/conversations/:id/pin and resolves void', async () => {
    const spy = vi.spyOn(apiClient, 'apiPut').mockResolvedValue(undefined);
    await expect(setPinnedConversation(ID_A, true)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(`/api/v1/conversations/${ID_A}/pin`, { pinned: true });
  });

  it('PUTs { pinned: false } when unpinning', async () => {
    const spy = vi.spyOn(apiClient, 'apiPut').mockResolvedValue(undefined);
    await expect(setPinnedConversation(ID_A, false)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(`/api/v1/conversations/${ID_A}/pin`, { pinned: false });
  });

  it('rejects with the ApiClientError when the response is not ok', async () => {
    const err = new ApiClientError('not-found', 'gone', undefined);
    vi.spyOn(apiClient, 'apiPut').mockRejectedValue(err);
    await expect(setPinnedConversation(ID_A, true)).rejects.toBe(err);
  });
});

describe('retitleConversation', () => {
  it('POSTs to /:id/retitle with no body and returns the validated title', async () => {
    const spy = vi.spyOn(apiClient, 'apiPost').mockResolvedValue({ title: 'AI title' } as never);
    await expect(retitleConversation(ID_A)).resolves.toEqual({ title: 'AI title' });
    expect(spy).toHaveBeenCalledWith(
      `/api/v1/conversations/${ID_A}/retitle`,
      undefined,
      expect.anything(),
    );
  });
});

describe('onConversationConflict', () => {
  it('invalidates the detail and list keys and signals on a conflict error', async () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const err = new ApiClientError('conflict', 'changed elsewhere', undefined);

    const result = onConversationConflict(ID_A, err, client);

    expect(result.isConflict).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversation', ID_A] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversations'] });
  });

  it('does NOT swallow a non-conflict error and does not invalidate', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const err = new ApiClientError('provider-error', 'boom', undefined);

    const result = onConversationConflict(ID_A, err, client);

    expect(result.isConflict).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('treats a non-ApiClientError as not-a-conflict and does not invalidate', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const result = onConversationConflict(ID_A, new Error('network'), client);

    expect(result.isConflict).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
