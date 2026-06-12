import { expect, test } from '@playwright/test';

import {
  expectAnnounced,
  expectNoAxeViolations,
  fillConnectionForm,
  openAddForm,
  recordAnnouncements,
  saveConnection,
  waitForSecretPut,
  waitForSettingsHydrated,
  waitForSettingsPatch,
} from './connections-helpers';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

/**
 * Per-flow accessibility coverage for the connection ADD and EDIT flows on /settings (REMOVE lives in
 * connections-remove.spec.ts). Each test is self-seeding (seedSettings replaces the whole connections
 * array and resets selectedModelId), arms the announcement recorder before the app loads, drives the
 * UI purely by role and label, and asserts the four screen-reader guarantees: keyboard operability +
 * focus management, the EXACT spoken announcement, axe zero-violations, and persistence across a
 * reload. No real credentials are needed - placeholder keys make every assertion deterministic.
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('ADD: a new connection saves with the two-call write, focuses its row, and persists', async ({
  page,
  request,
}) => {
  await seedSettings(request, { selectedModelId: '', connections: [] });
  await recordAnnouncements(page);
  await page.goto('/settings');
  await waitForSettingsHydrated(page);

  await openAddForm(page);
  // Anthropic is the default add type, so Label + API key are the only required inputs.
  await fillConnectionForm(page, { label: 'My Claude', apiKey: 'sk-e2e-placeholder' });

  // A keyed save fires PATCH /api/v1/settings THEN PUT /api/v1/connections/<id>/secret. Arm both
  // before clicking so neither response can be missed.
  const patched = waitForSettingsPatch(page);
  const secretPut = waitForSecretPut(page);
  await saveConnection(page);
  await patched;
  await secretPut;

  // After a save, focus moves to the saved row's <h3> and the key indicator reads "Set".
  const row = page.getByRole('heading', { level: 3, name: 'My Claude' });
  await expect(row).toBeVisible();
  await expect(row).toBeFocused();
  await expect(page.getByText('API key: Set')).toBeVisible();
  await expectAnnounced(page, 'Connection My Claude saved');
  await expectNoAxeViolations(page);

  // Reload: the GET is the source of truth, so the connection (and its key indicator) must survive.
  await page.reload();
  await waitForSettingsHydrated(page);
  await expect(page.getByRole('heading', { level: 3, name: 'My Claude' })).toBeVisible();
  await expect(page.getByText('API key: Set')).toBeVisible();
});

test('EDIT: renaming a connection saves with one call, focuses the renamed row, and persists', async ({
  page,
  request,
}) => {
  await seedSettings(request, {
    selectedModelId: '',
    connections: [
      { id: 'my-claude', label: 'My Claude', type: 'anthropic', apiKey: 'sk-e2e-placeholder' },
    ],
  });
  await recordAnnouncements(page);
  await page.goto('/settings');
  await waitForSettingsHydrated(page);

  // Opening Edit reveals the inline form; its <h3> "Edit <label>" receives focus.
  await page.getByRole('button', { name: 'Edit My Claude' }).click();
  const editHeading = page.getByRole('heading', { level: 3, name: 'Edit My Claude' });
  await expect(editHeading).toBeVisible();
  await expect(editHeading).toBeFocused();

  await page.getByLabel('Label').fill('Renamed Claude');

  // No key change -> only the PATCH fires (no secret PUT). Arm the PATCH wait before saving.
  const patched = waitForSettingsPatch(page);
  await saveConnection(page);
  await patched;

  const renamedRow = page.getByRole('heading', { level: 3, name: 'Renamed Claude' });
  await expect(renamedRow).toBeVisible();
  await expect(renamedRow).toBeFocused();
  await expectAnnounced(page, 'Connection Renamed Claude saved');
  await expectNoAxeViolations(page);

  await page.reload();
  await waitForSettingsHydrated(page);
  await expect(page.getByRole('heading', { level: 3, name: 'Renamed Claude' })).toBeVisible();
});
