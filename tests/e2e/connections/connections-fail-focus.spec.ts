import { expect, test, type Page, type Route } from '@playwright/test';

import {
  expectNoAxeViolations,
  recordAnnouncements,
  saveConnection,
  waitForSettingsHydrated,
} from './connections-helpers';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

/**
 * Regression coverage for a failed save or remove: when a connections settings PATCH FAILS, focus must never fall
 * to <body> (a screen-reader user would lose their place). The save path re-arms the form's opener
 * (the edited row's Edit button); the remove path re-arms a still-mounted sibling's Edit button (or
 * the Add button when the list empties). Each test forces the public PATCH to 400 via route
 * interception while leaving every other request untouched, then asserts the focus landing.
 *
 * The forced failure body matches the canonical ApiErrorSchema ({ code, message }) so the store
 * classifies it as a normal save failure (not a file-invalid overwrite prompt) and resolves `false`.
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

/** A canonical 400 the settings store classifies as `save-failed` (reverts the optimistic change). */
function failSettingsPatch(route: Route): Promise<void> {
  if (route.request().method() === 'PATCH') {
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'validation-error', message: 'forced', details: [] }),
    });
  }
  return route.continue();
}

/** Seed two anthropic connections (the seed uses the request fixture, so route interception misses it). */
async function seedTwoAndOpen(page: Page, request: import('@playwright/test').APIRequestContext) {
  await seedSettings(request, {
    selectedModelId: '',
    connections: [
      { id: 'claude-one', label: 'Claude One', type: 'anthropic', apiKey: 'sk-e2e-placeholder' },
      { id: 'claude-two', label: 'Claude Two', type: 'anthropic', apiKey: 'sk-e2e-placeholder' },
    ],
  });
  await recordAnnouncements(page);
  await page.goto('/settings');
  await waitForSettingsHydrated(page);
}

test('SAVE failure: focus lands on the edited row Edit button, never on <body>', async ({
  page,
  request,
}) => {
  await seedTwoAndOpen(page, request);
  // Intercept AFTER hydration so the initial GET loads cleanly; only the save PATCH is forced to fail.
  await page.route('**/api/v1/settings', failSettingsPatch);

  await page.getByRole('button', { name: 'Edit Claude One' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Edit Claude One' })).toBeFocused();
  // No key change, so the save fires only the PATCH (which fails). Wait for the failed response.
  const failed = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/settings') &&
      r.request().method() === 'PATCH' &&
      r.status() === 400,
  );
  await saveConnection(page);
  await failed;

  // The row reverted (it still exists); focus must move to its Edit button, not fall to <body>.
  await expect(page.locator('body')).not.toBeFocused();
  await expect(page.getByRole('button', { name: 'Edit Claude One' })).toBeFocused();
  await expectNoAxeViolations(page);
});

test('REMOVE failure: focus lands on a sibling Edit button, never on <body>', async ({
  page,
  request,
}) => {
  await seedTwoAndOpen(page, request);
  await page.route('**/api/v1/settings', failSettingsPatch);

  await page.getByRole('button', { name: 'Remove Claude One' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove connection?' });
  await expect(dialog).toBeVisible();
  const failed = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/settings') &&
      r.request().method() === 'PATCH' &&
      r.status() === 400,
  );
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await failed;

  // The store reverted the optimistic removal (the row is back); focus must move to the sibling's
  // Edit button, not stay on <body> after the dialog's detached opener was skipped.
  await expect(page.locator('body')).not.toBeFocused();
  await expect(page.getByRole('button', { name: 'Edit Claude Two' })).toBeFocused();
  await expectNoAxeViolations(page);
});
