import type { APIRequestContext } from '@playwright/test';

/**
 * The known e2e baseline (decision Q7=b): a union reset of every settings field any spec mutates,
 * back to its `SettingsSchema` default. Hardcoded as literals because the Node Playwright runner
 * cannot import `@anvika/shared`. If a future spec mutates another field, add it here.
 */
const E2E_SETTINGS_BASELINE = {
  selectedModelId: '',
  connections: [],
  assistantName: 'Assistant',
  announcementPeriodMs: 2000,
} as const;

/**
 * Reset the shared single-owner e2e server state to a known baseline before a test, so specs are
 * isolated and order-independent (Playwright's "clean up between tests" strategy). Deletes every
 * conversation for the `local` owner, then resets the settings any spec mutates (connections,
 * selected model, assistant name, announcement period) to their defaults so readiness returns to
 * `unconfigured` and no personalization bleeds across specs. Each spec seeds exactly what it needs
 * afterwards. Throws on a non-ok response so a broken reset fails the test loudly.
 *
 * @param request - The Playwright API request context bound to the e2e server's base URL.
 */
export async function resetState(request: APIRequestContext): Promise<void> {
  const listed = await request.get('/api/v1/conversations');
  if (!listed.ok()) throw new Error(`resetState list failed: ${listed.status()}`);
  const body: unknown = await listed.json();
  const ids =
    typeof body === 'object' &&
    body !== null &&
    'conversations' in body &&
    Array.isArray(body.conversations)
      ? body.conversations
          .map((row: unknown) =>
            typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string'
              ? row.id
              : null,
          )
          .filter((id): id is string => id !== null)
      : [];
  if (ids.length > 0) {
    const deleted = await request.post('/api/v1/conversations/delete-batch', { data: { ids } });
    if (!deleted.ok()) throw new Error(`resetState delete-batch failed: ${deleted.status()}`);
  }
  const reset = await request.patch('/api/v1/settings', { data: E2E_SETTINGS_BASELINE });
  if (!reset.ok()) throw new Error(`resetState settings PATCH failed: ${reset.status()}`);
}
