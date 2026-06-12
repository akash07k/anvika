import { expect, test, type Page } from '@playwright/test';

import {
  expectAnnounced,
  expectNoAxeViolations,
  recordAnnouncements,
  waitForSettingsHydrated,
  waitForSettingsPatch,
} from './connections-helpers';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

/**
 * Per-flow accessibility coverage for the connection REMOVE flow on /settings, exercising every branch
 * of the post-remove focus rule (next sibling, then previous sibling, then the Add button when the
 * list empties) so a keyboard user is never dropped to <body>. Each test self-seeds, arms the
 * announcement recorder before load, drives the UI by role and label, and asserts the spoken
 * announcement, focus landing, axe zero-violations, and persistence. Placeholder keys keep it
 * deterministic with no real credentials.
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

/** Open the remove confirm for `label`, confirm via the dialog's Remove button, and await the PATCH. */
async function removeConnection(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: `Remove ${label}` }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove connection?' });
  await expect(dialog).toBeVisible();
  const patched = waitForSettingsPatch(page);
  await dialog.getByRole('button', { name: 'Remove' }).click();
  await patched;
}

/** Seed two anthropic connections with placeholder keys and land on a hydrated /settings page. */
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

test('REMOVE first of two: confirm gates removal, then focus lands on the NEXT row Edit', async ({
  page,
  request,
}) => {
  await seedTwoAndOpen(page, request);

  // Escape dismisses the dialog WITHOUT removing the connection (the destructive action is gated).
  await page.getByRole('button', { name: 'Remove Claude One' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove connection?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 3, name: 'Claude One' })).toBeVisible();

  // Confirm: removing the FIRST row moves focus to the NEXT sibling's Edit button.
  await removeConnection(page, 'Claude One');
  await expect(page.getByRole('heading', { level: 3, name: 'Claude One' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: 'Claude Two' })).toBeVisible();
  await expectAnnounced(page, 'Connection Claude One removed');
  await expect(page.getByRole('button', { name: 'Edit Claude Two' })).toBeFocused();
  await expectNoAxeViolations(page);

  await page.reload();
  await waitForSettingsHydrated(page);
  await expect(page.getByRole('heading', { level: 3, name: 'Claude One' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: 'Claude Two' })).toBeVisible();
});

test('REMOVE the LAST row: focus falls back to the PREVIOUS row Edit', async ({
  page,
  request,
}) => {
  await seedTwoAndOpen(page, request);

  // Removing the LAST row has no next sibling, so focus falls back to the previous row's Edit button.
  await removeConnection(page, 'Claude Two');
  await expect(page.getByRole('heading', { level: 3, name: 'Claude Two' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 3, name: 'Claude One' })).toBeVisible();
  await expectAnnounced(page, 'Connection Claude Two removed');
  await expect(page.getByRole('button', { name: 'Edit Claude One' })).toBeFocused();
  await expectNoAxeViolations(page);
});

test('REMOVE the ONLY connection: focus lands on the Add connection button', async ({
  page,
  request,
}) => {
  await seedSettings(request, {
    selectedModelId: '',
    connections: [
      { id: 'claude-one', label: 'Claude One', type: 'anthropic', apiKey: 'sk-e2e-placeholder' },
    ],
  });
  await recordAnnouncements(page);
  await page.goto('/settings');
  await waitForSettingsHydrated(page);

  // With no sibling left, focus must land on the Add connection button (not dropped to <body>).
  await removeConnection(page, 'Claude One');
  await expect(page.getByRole('heading', { level: 3, name: 'Claude One' })).toHaveCount(0);
  await expectAnnounced(page, 'Connection Claude One removed');
  await expect(page.getByRole('button', { name: 'Add connection' })).toBeFocused();
  await expectNoAxeViolations(page);
});
