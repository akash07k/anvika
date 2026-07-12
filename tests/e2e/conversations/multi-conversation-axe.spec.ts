import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ALPHA, BETA, GAMMA, navOf, seedConversations } from './multi-conversation-helpers';
import { resetState } from '../support/reset';

/**
 * Axe zero-violations sweep for the multi-conversation surface and the Settings batch-delete dialog.
 * Split out of `multi-conversation.spec.ts` so each file stays under the 200-line cap; the shared
 * seed/helpers live in `multi-conversation-helpers.ts`. Credential-free and always runs (pure
 * metadata, touches no model).
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('the conversation surface and the batch-delete dialog have no axe violations', async ({
  page,
  request,
}) => {
  await seedConversations(request, [ALPHA, BETA, GAMMA]);

  // (a) The conversation surface showing the list.
  await page.goto('/');
  await expect(page).toHaveURL(/\/c\//);
  await expect(navOf(page).getByRole('link', { name: GAMMA.title, exact: true })).toBeVisible();
  // The header's model picker is disabled while `useModels` is still pending; a disabled trigger
  // renders its text through `disabled:opacity-50`, which axe composites to a faint gray and reports
  // as a false color-contrast failure (WCAG 1.4.3 exempts inactive controls). Wait for it to enable
  // (the seeded `local:e2e-model` populates the list) so we audit the resting, interactive state -
  // the same "wait for the transient state to settle" guard the batch-delete dialog uses below.
  await expect(page.locator('#conversation-model')).toBeEnabled();
  const surfaceResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(surfaceResults.violations).toEqual([]);

  // (b) The Settings "Manage conversations" batch-delete dialog. Its trigger's accessible name carries
  // the count ("Manage conversations, N total"), so match by the visible-label prefix.
  await page.goto('/settings');
  await page.getByRole('button', { name: /^Manage conversations/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage conversations' });
  await expect(dialog).toBeVisible();
  // The dialog fades/zooms in (data-open:animate-in). axe computes the COMPOSITED color, so auditing
  // mid-fade reads the dark text at partial opacity as a faint gray and reports a false color-contrast
  // failure. Wait for the open animation to settle (opacity 1) before auditing the resting state.
  await expect
    .poll(async () => dialog.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1);
  const dialogResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(dialogResults.violations).toEqual([]);
});
