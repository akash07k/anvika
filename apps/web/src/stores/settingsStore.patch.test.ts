import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

import { defaultsView, okView, registerSettingsTestHooks, reply } from './settingsStore.testkit';
import { useSettingsStore } from './settingsStore';

registerSettingsTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settings store patch boolean contract', () => {
  it('resolves true on a successful commit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(reply(okView({ announcementPeriodMs: 2500, connections: [] })));
    const ok = await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    expect(ok).toBe(true);
  });

  it('resolves false on a validation-error rejection', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(reply({ code: 'validation-error', message: 'bad' }, 400));
    const ok = await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 5 }, (s) => ({ ...s, announcementPeriodMs: 5 }));
    expect(ok).toBe(false);
  });

  it('resolves false on a settings-file-invalid rejection and arms the overwrite prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'settings-file-invalid', message: 'invalid file' }, 409),
    );
    const ok = await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    expect(ok).toBe(false);
    expect(useSettingsStore.getState().invalidFilePrompt).not.toBeNull();
  });

  it('resolves false when there is nothing to patch (settings is null)', async () => {
    // No hydrate: the store's settings is null, so the `if (!previous)` guard returns false without
    // touching the network. This is the guard the two-call save sequencing relies on.
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const ok = await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies overlapping commits in enqueue order (the later value wins)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();

    // PATCH-1 is left pending; PATCH-2 must queue behind it rather than fetch concurrently.
    let releaseP1!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (releaseP1 = res)));
    fetchMock.mockResolvedValueOnce(reply(okView({ announcementPeriodMs: 3000, connections: [] })));

    const p1 = useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 1000 }, (s) => ({ ...s, announcementPeriodMs: 1000 }));
    const p2 = useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 3000 }, (s) => ({ ...s, announcementPeriodMs: 3000 }));

    await Promise.resolve();
    // Only hydrate + PATCH-1 have fetched; PATCH-2 is queued behind the pending PATCH-1.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releaseP1(reply(okView({ announcementPeriodMs: 1000, connections: [] }))); // PATCH-1 succeeds
    const [ok1, ok2] = await Promise.all([p1, p2]);
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(useSettingsStore.getState().settings?.announcementPeriodMs).toBe(3000);
  });

  it('reverts a failed later commit to the prior settled state, not over the earlier success', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate (announcementPeriodMs 2000)
    await useSettingsStore.getState().hydrate();

    // PATCH-1 is held pending; PATCH-2 queues behind it and will FAIL after PATCH-1 has committed.
    let releaseP1!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (releaseP1 = res)));
    fetchMock.mockResolvedValueOnce(reply({ code: 'validation-error', message: 'bad' }, 400));

    const p1 = useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 1000 }, (s) => ({ ...s, announcementPeriodMs: 1000 }));
    const p2 = useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 3000 }, (s) => ({ ...s, announcementPeriodMs: 3000 }));

    // Let PATCH-1's fetch fire (assigning releaseP1) while PATCH-2 stays queued behind it.
    await Promise.resolve();
    releaseP1(reply(okView({ announcementPeriodMs: 1000, connections: [] }))); // PATCH-1 succeeds
    const [ok1, ok2] = await Promise.all([p1, p2]);
    expect(ok1).toBe(true);
    expect(ok2).toBe(false);
    // The fix: PATCH-2's rollback snapshot is taken AFTER PATCH-1 settles, so its failure reverts to
    // PATCH-1's committed 1000 -- not back to the pre-PATCH-1 default (2000), which is what the old
    // concurrent path would have clobbered the success with.
    expect(useSettingsStore.getState().settings?.announcementPeriodMs).toBe(1000);
  });

  it('shares one queue across writers: a patch waits for an in-flight FX refresh', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();

    // The FX refresh is left pending; the patch must queue behind it (shared queue), not fetch
    // concurrently. This proves refreshFxRate and patch share one single-flight queue.
    let releaseFx!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (releaseFx = res)));
    fetchMock.mockResolvedValueOnce(reply(okView({ announcementPeriodMs: 2500, connections: [] })));

    const fx = useSettingsStore.getState().refreshFxRate();
    const p = useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));

    await Promise.resolve();
    // Only hydrate + FX have fetched; the patch is queued behind the pending FX refresh.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releaseFx(reply(okView({ inrPerUsd: 88, connections: [] }))); // FX settles, releasing the queue
    await Promise.all([fx, p]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('shares one queue across writers: confirmInvalidOverwrite waits for an in-flight patch (third writer)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();

    // Arm the overwrite prompt: a patch blocked by an invalid on-disk file (409 settings-file-invalid).
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'settings-file-invalid', message: 'invalid file' }, 409),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }), {
        announce: false,
      });
    expect(useSettingsStore.getState().invalidFilePrompt).not.toBeNull();

    // Hold a peer patch pending; confirmInvalidOverwrite (the third writer) must queue behind it on
    // the SHARED writeQueue rather than re-run concurrently and clobber the peer.
    let releasePeer!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((res) => (releasePeer = res)));
    fetchMock.mockResolvedValueOnce(reply(okView({ announcementPeriodMs: 3000, connections: [] })));

    const peer = useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 3000 }, (s) => ({ ...s, announcementPeriodMs: 3000 }));
    const confirm = useSettingsStore.getState().confirmInvalidOverwrite();

    await Promise.resolve();
    // hydrate + failed-patch + peer have fetched; the overwrite re-run is queued behind the pending peer.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    releasePeer(reply(okView({ announcementPeriodMs: 3000, connections: [] }))); // peer settles
    await Promise.all([peer, confirm]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
