import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

import {
  defaultsView,
  events,
  okView,
  registerSettingsTestHooks,
  reply,
} from './settingsStore.testkit';
import { useSettingsStore } from './settingsStore';

registerSettingsTestHooks();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settings store refreshFxRate action', () => {
  it('reconciles the new rate and announces the success lifecycle', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(reply(okView({ inrPerUsd: 84.5, connections: [] }, 4)));

    await useSettingsStore.getState().refreshFxRate();

    expect(useSettingsStore.getState().settings?.inrPerUsd).toBe(84.5);
    expect(events).toEqual([{ type: 'fxRefreshStarted' }, { type: 'fxRefreshOk', rate: 84.5 }]);
  });

  it('announces the failure lifecycle and leaves settings unchanged', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    const seeded = useSettingsStore.getState().settings;
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'fx-refresh-failed', message: 'upstream down' }, 502),
    );

    await useSettingsStore.getState().refreshFxRate();

    expect(events).toEqual([{ type: 'fxRefreshStarted' }, { type: 'fxRefreshFailed' }]);
    expect(useSettingsStore.getState().settings).toEqual(seeded);
  });

  it('announces the failure lifecycle when the response carries no body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    const seeded = useSettingsStore.getState().settings;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await useSettingsStore.getState().refreshFxRate();

    expect(events).toEqual([{ type: 'fxRefreshStarted' }, { type: 'fxRefreshFailed' }]);
    expect(useSettingsStore.getState().settings).toEqual(seeded);
  });
});
