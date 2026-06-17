/**
 * Shared test helpers for settingsStore test siblings.
 *
 * Each sibling file re-declares its own `vi.mock(...)` calls (vitest hoists
 * mocks per-file) and imports the non-mock setup from here.
 */

import { afterEach, beforeEach } from 'vitest';

import type { NotificationEvent } from '../notifications/events';
import { registerChannel, resetChannels } from '../notifications/notifier';
import { useSettingsStore } from './settingsStore';

/** Build a minimal JSON response from a status + body. */
export function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Canonical paths fixture used across all settings store tests. */
export const paths = { settings: '/d/settings.json', secrets: '/d/secrets.json' };

/** The default hydrated view returned by GET /api/v1/settings. */
export const defaultsView = {
  version: 1,
  settings: { announcementPeriodMs: 2000, connections: [] },
  recovered: false,
  paths,
};

/**
 * Build a full settings response envelope for a PATCH/GET reply.
 *
 * @param settings - Partial settings fields to include.
 * @param version  - Schema version number (defaults to 1).
 * @param recovered - Whether the server recovered from a corrupt file.
 */
export function okView(
  settings: Record<string, unknown>,
  version = 1,
  recovered = false,
): Record<string, unknown> {
  return { version, settings, recovered, paths };
}

/**
 * Mutable event bus for capturing notification events in tests.
 * Each sibling file uses this array in its `beforeEach`/`afterEach` hooks.
 */
export const events: NotificationEvent[] = [];

/** Register shared notification-capture and store-reset lifecycle hooks. */
export function registerSettingsTestHooks(): void {
  beforeEach(() => {
    events.length = 0;
    registerChannel((e) => events.push(e));
  });

  afterEach(() => {
    resetChannels();
    useSettingsStore.setState({
      status: 'idle',
      version: null,
      settings: null,
      error: null,
      fieldErrors: {},
      recovered: false,
      paths: null,
      invalidFilePrompt: null,
    });
  });
}
