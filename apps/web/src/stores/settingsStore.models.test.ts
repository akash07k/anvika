import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

import { queryClient } from '../lib/queryClient';
import { modelsQueryKey } from '../hooks/conversation/useModels';
import { defaultsView, okView, registerSettingsTestHooks, reply } from './settingsStore.testkit';
import { useSettingsStore } from './settingsStore';

registerSettingsTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settings store models invalidation', () => {
  it('invalidates the models query after a successful connections patch', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    const saved = [{ id: 'openai', type: 'openai', label: 'OpenAI', apiKey: { isSet: true } }];
    fetchMock.mockResolvedValueOnce(
      reply(
        okView({
          announcementPeriodMs: 2000,
          connections: saved,
        }),
      ),
    );
    await useSettingsStore
      .getState()
      .patch(
        { connections: [{ id: 'openai', type: 'openai', label: 'OpenAI', apiKey: 'sk' }] },
        (s) => ({
          ...s,
          connections: saved as never,
        }),
      );
    expect(spy).toHaveBeenCalledWith({ queryKey: modelsQueryKey });
  });

  it('does not invalidate the models query for a non-model setting', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply(
        okView({
          announcementPeriodMs: 3000,
          connections: [],
        }),
      ),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 3000 }, (s) => ({ ...s, announcementPeriodMs: 3000 }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips the models invalidation on a connections patch when skipModelsInvalidation is set', async () => {
    // The with-secret save path passes skipModelsInvalidation so the keyless public PATCH does not
    // fire a premature, immediately-stale refetch; the following secret PUT owns the single one.
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    const saved = [{ id: 'openai', type: 'openai', label: 'OpenAI', apiKey: { isSet: true } }];
    fetchMock.mockResolvedValueOnce(
      reply(okView({ announcementPeriodMs: 2000, connections: saved })),
    );
    const ok = await useSettingsStore
      .getState()
      .patch(
        { connections: [{ id: 'openai', type: 'openai', label: 'OpenAI', apiKey: 'sk' }] },
        (s) => ({ ...s, connections: saved as never }),
        { skipModelsInvalidation: true },
      );
    expect(ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
