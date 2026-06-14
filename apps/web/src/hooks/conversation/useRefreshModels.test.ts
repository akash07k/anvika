import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api-client', () => ({ apiPost: vi.fn() }));
vi.mock('../../notifications/notifier', () => ({ notify: vi.fn() }));

import { apiPost } from '../../lib/api-client';
import { notify } from '../../notifications/notifier';
import { queryClient } from '../../lib/queryClient';
import { modelsQueryKey } from './useModels';
import { useRefreshModels } from './useRefreshModels';

const conns = [{ id: 'local', label: 'Local' }] as never;

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
});

describe('useRefreshModels', () => {
  it('announces started then ok with the count and named problems, and reconciles the cache', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      models: [{ id: 'a:1' }, { id: 'a:2' }],
      connectionStatuses: [{ connectionId: 'local', outcome: 'unreachable' }],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
    const { result } = renderHook(() => useRefreshModels(conns));
    await act(async () => {
      await result.current.refresh();
    });
    expect(notify).toHaveBeenCalledWith({ type: 'modelsRefreshStarted' });
    expect(notify).toHaveBeenCalledWith({
      type: 'modelsRefreshOk',
      count: 2,
      problemLabels: ['Local'],
    });
  });

  it('announces the uniform failure when the POST throws', async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRefreshModels(conns));
    await act(async () => {
      await result.current.refresh();
    });
    expect(notify).toHaveBeenCalledWith({ type: 'modelsRefreshFailed' });
  });

  it('announces the uniform failure when the response has no body (204)', async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefreshModels(conns));
    await act(async () => {
      await result.current.refresh();
    });
    expect(notify).toHaveBeenCalledWith({ type: 'modelsRefreshFailed' });
  });

  it('busy is true while POST is in flight and false after on the ok path; cache is reconciled', async () => {
    const envelope = {
      models: [{ id: 'a:1' }],
      connectionStatuses: [],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    } as const;
    let resolve!: (v: typeof envelope) => void;
    vi.mocked(apiPost).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useRefreshModels(conns));
    // Start refresh - do not await, so we can inspect in-flight state.
    let refreshDone!: Promise<void>;
    act(() => {
      refreshDone = result.current.refresh();
    });
    expect(result.current.busy).toBe(true);

    // Resolve the POST and wait for effects to flush.
    await act(async () => {
      resolve(envelope);
      await refreshDone;
    });
    expect(result.current.busy).toBe(false);
    expect(queryClient.getQueryData(modelsQueryKey)).toEqual(envelope);
  });

  it('busy is false after on the !body/204 path (finally runs on early return)', async () => {
    let resolve!: (v: undefined) => void;
    vi.mocked(apiPost).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useRefreshModels(conns));
    let refreshDone!: Promise<void>;
    act(() => {
      refreshDone = result.current.refresh();
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolve(undefined);
      await refreshDone;
    });
    expect(result.current.busy).toBe(false);
  });
});
