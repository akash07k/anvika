import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

import { queryClient } from '../lib/queryClient';
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

/** A with-secret connections wire patch and its optimistic projection (label only crosses to state). */
const wire = { connections: [{ id: 'openai', type: 'openai', label: 'OpenAI', apiKey: 'sk' }] };
const saved = [{ id: 'openai', type: 'openai', label: 'OpenAI', apiKey: { isSet: true } }];

describe('settings store invalid-file overwrite for a with-secret connection save', () => {
  it('announces connectionSaveFailed with the label, not settingsSaved, after the overwrite', async () => {
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(reply(defaultsView)); // hydrate
    await useSettingsStore.getState().hydrate();

    // The public PATCH of a with-secret save is blocked by an invalid file; the label is threaded so
    // the overwrite-confirm can warn the key still needs re-entering (never the secret itself).
    fetchMock.mockResolvedValueOnce(
      reply({ code: 'settings-file-invalid', message: 'invalid file' }, 409),
    );
    const ok = await useSettingsStore
      .getState()
      .patch(wire, (s) => ({ ...s, connections: saved as never }), {
        announce: false,
        skipModelsInvalidation: true,
        pendingSecretLabel: 'OpenAI',
      });
    expect(ok).toBe(false);
    expect(useSettingsStore.getState().invalidFilePrompt?.pendingSecretLabel).toBe('OpenAI');

    // Confirming the overwrite replays the public PATCH (now succeeding). The key was NOT written, so
    // the user must hear the partial-failure notice, not a silent "Settings saved".
    fetchMock.mockResolvedValueOnce(
      reply(okView({ announcementPeriodMs: 2000, connections: saved })),
    );
    await useSettingsStore.getState().confirmInvalidOverwrite();

    expect(events).toContainEqual({ type: 'connectionSaveFailed', label: 'OpenAI' });
    expect(events).not.toContainEqual({ type: 'settingsSaved' });
  });
});
