import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

/**
 * Delete-focus e2e: deleting a conversation from a section moves focus to the next row in that section
 * (the screen-reader/keyboard user is never stranded on the body). The companion pin spec covers the
 * "section emptied -> focus the list heading" path; this covers the "sibling remains -> focus it" path.
 *
 * Credential-free: deleting and renaming touch no model. We seed a selected model (so the conversation
 * surface and its nav render), then seed two conversations via the reasoning-override create-if-absent
 * path and give them distinct titles via rename so the row queries are unambiguous.
 */

/** Two fixed `xxx-xxx` ids and the distinct titles we rename them to. */
const KEEP_ID = 'ddd-ddd';
const KEEP_TITLE = 'Alpha chat';
const DELETE_ID = 'eee-eee';
const DELETE_TITLE = 'Beta chat';

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('deleting a row from a section moves focus to the next row in that section', async ({
  page,
  request,
}) => {
  await seedSettings(request, {
    selectedModelId: 'local:e2e-model',
    connections: [
      {
        id: 'local',
        label: 'Local',
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:9123/v1',
        apiKey: 'sk-e2e-placeholder',
        manualModelIds: ['e2e-model'],
      },
    ],
  });

  // Seed two empty conversations (create-if-absent), then rename them to distinct titles.
  for (const id of [KEEP_ID, DELETE_ID]) {
    const seeded = await request.patch(`/api/v1/conversations/${id}/reasoning`, {
      data: { reasoningOverride: null },
    });
    expect(seeded.ok()).toBeTruthy();
  }
  expect(
    (await request.patch(`/api/v1/conversations/${KEEP_ID}`, { data: { title: KEEP_TITLE } })).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.patch(`/api/v1/conversations/${DELETE_ID}`, { data: { title: DELETE_TITLE } })
    ).ok(),
  ).toBeTruthy();

  // View KEEP (so DELETE is a NON-active delete and the view does not navigate away).
  await page.goto(`/c/${KEEP_ID}`);

  const nav = page.getByRole('navigation', { name: 'Conversations List' });
  const keepRow = nav.getByRole('link', { name: KEEP_TITLE, exact: true });
  const deleteRow = nav.getByRole('link', { name: DELETE_TITLE, exact: true });
  // Both start in the expanded Recent section.
  await expect(keepRow).toBeVisible();
  await expect(deleteRow).toBeVisible();

  // Open the delete row's context menu, choose Delete, and confirm in the dialog.
  await deleteRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog', { name: 'Delete conversation?' }).waitFor();
  await page.getByRole('button', { name: 'Delete' }).click();

  // The deleted row is gone, and focus moved to the surviving sibling in the same section rather than
  // falling to the body.
  await expect(nav.getByRole('link', { name: DELETE_TITLE, exact: true })).toHaveCount(0);
  await expect(keepRow).toBeFocused();
});
