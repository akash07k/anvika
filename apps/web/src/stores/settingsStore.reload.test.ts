import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

import { logDiag } from '../diagnostics/logDiag';
import { queryClient } from '../lib/queryClient';
import { modelsQueryKey } from '../hooks/conversation/useModels';
import {
  defaultsView,
  events,
  okView,
  paths,
  registerSettingsTestHooks,
  reply,
} from './settingsStore.testkit';
import { useSettingsStore } from './settingsStore';

registerSettingsTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(logDiag).mockClear();
});

describe('settings store recovered/paths and reload', () => {
  it('stores recovered and paths from the hydrate response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(defaultsView));
    await useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.recovered).toBe(false);
    expect(s.paths).toEqual(paths);
  });

  it('announces and logs a degraded load when hydrate returns recovered', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(okView({ connections: [] }, 1, true)));
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().recovered).toBe(true);
    expect(events).toContainEqual({ type: 'settingsLoadDegraded' });
    expect(logDiag).toHaveBeenCalledWith({ type: 'settingsLoadDegraded' });
  });

  it('reload re-hydrates, invalidates models, and announces a healthy reload', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(defaultsView));
    await useSettingsStore.getState().reload();
    expect(spy).toHaveBeenCalledWith({ queryKey: modelsQueryKey });
    expect(events).toContainEqual({ type: 'settingsReloaded' });
    expect(logDiag).toHaveBeenCalledWith({ type: 'settingsReloaded' });
  });

  it('reload is silent and does not invalidate models when re-hydrate fails', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    // A failing fetch drives hydrate into status:'error'; a stale recovered:false must not leak a
    // false "Settings reloaded" announcement, and a failed reload must not invalidate the models query.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await useSettingsStore.getState().reload();
    expect(useSettingsStore.getState().status).toBe('error');
    expect(events).not.toContainEqual({ type: 'settingsReloaded' });
    expect(logDiag).not.toHaveBeenCalledWith({ type: 'settingsReloaded' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reload does not announce settingsReloaded when the result is still degraded', async () => {
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(okView({ connections: [] }, 1, true)));
    await useSettingsStore.getState().reload();
    expect(events).not.toContainEqual({ type: 'settingsReloaded' });
    expect(events).toContainEqual({ type: 'settingsLoadDegraded' });
  });
});

describe('settings store invalid-file overwrite flow', () => {
  it('sets invalidFilePrompt on a settings-file-invalid PATCH without announcing a save failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'settings-file-invalid', message: 'invalid file' }, 409),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    const s = useSettingsStore.getState();
    expect(s.settings?.announcementPeriodMs).toBe(2000); // reverted
    expect(s.invalidFilePrompt).not.toBeNull();
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'settingsSaveFailed' }) as never,
    );
  });

  it('confirmInvalidOverwrite re-PATCHes with overwriteInvalid=true and clears the prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'settings-file-invalid', message: 'invalid file' }, 409),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    fetchMock.mockResolvedValueOnce(
      reply(
        okView({
          announcementPeriodMs: 2500,
          connections: [],
        }),
      ),
    );
    await useSettingsStore.getState().confirmInvalidOverwrite();
    const lastUrl = fetchMock.mock.calls.at(-1)?.[0];
    expect(lastUrl).toBe('/api/v1/settings?overwriteInvalid=true');
    const s = useSettingsStore.getState();
    expect(s.invalidFilePrompt).toBeNull();
    expect(s.settings?.announcementPeriodMs).toBe(2500);
    await vi.waitFor(() => expect(events).toContainEqual({ type: 'settingsSaved' }));
  });

  it('confirmInvalidOverwrite invalidates the models query when the wirePatch touches connections', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'settings-file-invalid', message: 'invalid file' }, 409),
    );
    await useSettingsStore
      .getState()
      .patch({ connections: [] }, (s) => ({ ...s, connections: [] }));
    spy.mockClear();
    fetchMock.mockResolvedValueOnce(
      reply(
        okView({
          connections: [],
        }),
      ),
    );
    await useSettingsStore.getState().confirmInvalidOverwrite();
    expect(spy).toHaveBeenCalledWith({ queryKey: modelsQueryKey });
  });

  it('cancelInvalidOverwrite clears the prompt', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'settings-file-invalid', message: 'invalid file' }, 409),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    expect(useSettingsStore.getState().invalidFilePrompt).not.toBeNull();
    useSettingsStore.getState().cancelInvalidOverwrite();
    expect(useSettingsStore.getState().invalidFilePrompt).toBeNull();
  });

  it('clears a stale invalidFilePrompt on a successful reload', async () => {
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'settings-file-invalid', message: 'invalid file' }, 409),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    expect(useSettingsStore.getState().invalidFilePrompt).not.toBeNull();
    // The user fixes the file on disk and reloads; a healthy load supersedes the pending prompt.
    fetchMock.mockResolvedValueOnce(reply(defaultsView));
    await useSettingsStore.getState().reload();
    expect(useSettingsStore.getState().invalidFilePrompt).toBeNull();
  });
});
