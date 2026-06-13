import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

// Unlike the conversation E2E, settings need no model credentials, so this spec ALWAYS runs
// (deterministic CI coverage of the full reload). It is NOT gated on Azure creds.
test('persists a settings change across a page reload', async ({ page }) => {
  await page.goto('/settings');

  // The form only renders once the settings store has hydrated (the "Loading settings..." status is
  // replaced by the form), so waiting for the announcement-period spinbutton is the ready-signal
  // that the hydrate gate resolved.
  const period = page.getByRole('spinbutton', { name: /announcement period/i });
  await expect(period).toBeVisible();

  // The save confirmation now goes through the notification layer (ariaNotify in a real browser),
  // which leaves no DOM artifact to assert on. So wait on the PATCH response itself - the
  // deterministic signal that the write settled - rather than a visible status string. Arm the wait
  // before blurring so the response cannot be missed.
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/settings') &&
      r.request().method() === 'PATCH' &&
      r.status() === 200,
  );

  // Commit on blur: a single fill + blur drives exactly one optimistic update and one PATCH.
  await period.fill('2500');
  await period.blur();
  await saved;

  // Reload: the post-reload GET is the source of truth, so the server must return the saved value.
  await page.reload();

  await expect(page.getByRole('spinbutton', { name: /announcement period/i })).toHaveValue('2500');

  // Axe: zero violations on the loaded settings form (same pattern as the conversation E2E).
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

// The Connections section is the new credentials surface (provider-connections milestone). It needs
// no model credentials, so this spec ALWAYS runs as deterministic CI coverage of the connections UI's
// accessibility. It mirrors the persistence spec's structure: hydrate, assert the fieldset, run axe.
test('the Connections settings surface is present and has no axe violations', async ({
  page,
  request,
}) => {
  // resetState already cleared connections; seed a known EMPTY connections state explicitly so this
  // surface/axe check is self-contained and deterministic.
  await seedSettings(request, { selectedModelId: '', connections: [] });
  await page.goto('/settings');

  // The form only renders once the settings store has hydrated; the announcement-period spinbutton is
  // the same ready-signal the persistence test waits on.
  await expect(page.getByRole('spinbutton', { name: /announcement period/i })).toBeVisible();

  // The connections fieldset exposes a "Connections" group (its <legend> carries the h2) and an Add
  // control. Asserting both confirms the new UI mounted before the axe scan.
  await expect(page.getByRole('group', { name: /connections/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: /^Connections? \(\d+\)$/ }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add connection' })).toBeVisible();

  // Zero axe violations across the settings page including the connections fieldset (same tags as the
  // other specs in this repo).
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
