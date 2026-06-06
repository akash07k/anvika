import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

import { logDiag } from '../diagnostics/logDiag';
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
  vi.mocked(logDiag).mockClear();
});

describe('settings store', () => {
  it('hydrates from GET /api/v1/settings', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(defaultsView));
    await useSettingsStore.getState().hydrate();
    const s = useSettingsStore.getState();
    expect(s.status).toBe('ready');
    expect(s.settings?.announcementPeriodMs).toBe(2000);
  });

  it('applies an optimistic update and reconciles from the PATCH response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply(
        okView({
          announcementPeriodMs: 2500,
          connections: [],
        }),
      ),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    expect(useSettingsStore.getState().settings?.announcementPeriodMs).toBe(2500);
    // The confirmation is deferred (so a control's own value announcement is spoken first), so poll.
    await vi.waitFor(() => expect(events).toContainEqual({ type: 'settingsSaved' }));
  });

  it('announces settingsSaved on a successful commit (regression lock)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply(
        okView({
          announcementPeriodMs: 2200,
          connections: [],
        }),
      ),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2200 }, (s) => ({ ...s, announcementPeriodMs: 2200 }));
    // The confirmation is deferred ~600ms (so a control's own value announcement is spoken first),
    // so poll until the deferred notify fires. This locks the commit-on-blur audible save feedback.
    await vi.waitFor(() => expect(events).toContainEqual({ type: 'settingsSaved' }));
  });

  it('honors announce: false -- the silent-commit capability emits no "Settings saved"', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply(
        okView({
          announcementPeriodMs: 2000,
          sendKeyMode: 'enter',
          connections: [],
        }),
      ),
    );
    await useSettingsStore
      .getState()
      .patch({ sendKeyMode: 'enter' }, (s) => ({ ...s, sendKeyMode: 'enter' }), {
        announce: false,
      });
    expect(useSettingsStore.getState().settings?.sendKeyMode).toBe('enter'); // value still updates
    expect(events).not.toContainEqual({ type: 'settingsSaved' }); // but no confirmation announcement
  });

  it('rolls back the optimistic change and sets an error on a failed PATCH', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(reply({ code: 'validation-error', message: 'bad' }, 400));
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 5 }, (s) => ({ ...s, announcementPeriodMs: 5 }));
    const s = useSettingsStore.getState();
    expect(s.settings?.announcementPeriodMs).toBe(2000); // rolled back
    expect(s.error).toBeTruthy();
  });

  it('maps validation issues to fieldErrors and announces the failure via settingsSaveFailed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    fetchMock.mockResolvedValueOnce(
      reply(
        {
          code: 'validation-error',
          message: 'Settings are invalid',
          details: [{ path: ['announcementPeriodMs'], message: 'Too small' }],
        },
        400,
      ),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 5 }, (s) => ({ ...s, announcementPeriodMs: 5 }));
    expect(useSettingsStore.getState().fieldErrors).toEqual({ 'announcement-period': 'Too small' });
    // The notifier speaks the failure once (high priority), naming the single mapped field (ADR 0015).
    expect(events).toContainEqual({
      type: 'settingsSaveFailed',
      message: 'Announcement period: Too small',
    });
  });

  it('clears stale fieldErrors when a later patch succeeds', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();
    // First patch fails validation and populates fieldErrors.
    fetchMock.mockResolvedValueOnce(
      reply(
        {
          code: 'validation-error',
          message: 'Settings are invalid',
          details: [{ path: ['announcementPeriodMs'], message: 'Too small' }],
        },
        400,
      ),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 5 }, (s) => ({ ...s, announcementPeriodMs: 5 }));
    expect(useSettingsStore.getState().fieldErrors).not.toEqual({});
    // A later successful patch must clear the field errors so no phantom inline error lingers.
    fetchMock.mockResolvedValueOnce(
      reply(
        okView({
          announcementPeriodMs: 2500,
          connections: [],
        }),
      ),
    );
    await useSettingsStore
      .getState()
      .patch({ announcementPeriodMs: 2500 }, (s) => ({ ...s, announcementPeriodMs: 2500 }));
    expect(useSettingsStore.getState().fieldErrors).toEqual({});
  });
});
