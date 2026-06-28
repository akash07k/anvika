import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

import {
  defaultsView,
  okView,
  registerSettingsTestHooks,
  reply,
} from '../../stores/settingsStore.testkit';
import { useSettingsStore } from '../../stores/settingsStore';
import { runSetSecret } from './useSetConnectionSecret';

registerSettingsTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runSetSecret', () => {
  it('reconciles version and settings from the authoritative redacted response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate (version 1, announcementPeriodMs 2000)
    await useSettingsStore.getState().hydrate();

    // Respond with a bumped version so the reconcile of BOTH fields is observable.
    fetchMock.mockResolvedValueOnce(
      reply(okView({ announcementPeriodMs: 2500, connections: [] }, 2)),
    );
    await runSetSecret({ id: 'openai', patch: { apiKey: 'sk-new' } });

    expect(useSettingsStore.getState().settings?.announcementPeriodMs).toBe(2500);
    expect(useSettingsStore.getState().version).toBe(2);
  });

  it('runs through the shared queue: the secret PUT waits for an in-flight patch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();

    // Hold a patch pending; the secret PUT must queue behind it on the SHARED writeQueue rather than
    // fetch concurrently and clobber the patch's reconcile (the race this serialization eliminates).
    let releasePatch!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (releasePatch = res)));
    fetchMock.mockResolvedValueOnce(reply(okView({ connections: [] }))); // the secret PUT response

    const patch = useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 3000 }, (s) => ({ ...s, announcementPeriodMs: 3000 }));
    const secret = runSetSecret({ id: 'openai', patch: { apiKey: 'sk-new' } });

    await Promise.resolve();
    // hydrate + the pending patch have fetched; the secret PUT is queued behind the pending patch.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releasePatch(reply(okView({ announcementPeriodMs: 3000, connections: [] }))); // patch settles
    await Promise.all([patch, secret]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects to the caller on a failed PUT without stalling the queue', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();

    // The secret PUT fails: the caller must see the rejection (so the fieldset announces the
    // partial failure), and the rejection must not stall the shared queue.
    fetchMock.mockResolvedValueOnce(reply({ code: 'validation-error', message: 'bad' }, 400));
    await expect(runSetSecret({ id: 'openai', patch: { apiKey: 'sk-bad' } })).rejects.toThrow();

    // A later writer still runs and reconciles, proving the failed secret PUT did not stall the queue.
    fetchMock.mockResolvedValueOnce(reply(okView({ announcementPeriodMs: 2750, connections: [] })));
    const ok = await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2750 }, (s) => ({ ...s, announcementPeriodMs: 2750 }));
    expect(ok).toBe(true);
    expect(useSettingsStore.getState().settings?.announcementPeriodMs).toBe(2750);
  });
});
