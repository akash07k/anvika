import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';

/**
 * First-run gate and display-name persistence e2e specs.
 *
 * Test 1 requires no credentials. The per-test resetState (beforeEach) clears connections and the
 * selected model back to the baseline, so with no selectedModelId and no configured connection
 * `computeReadiness` returns `unconfigured` and the WelcomePanel is shown - no in-test seed needed.
 *
 * Test 2 requires no credentials either: the assistant-name field is a plain text setting that
 * round-trips through `PATCH /api/v1/settings` with no model involved.
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('first run shows the welcome panel and routes to Settings', async ({ page }) => {
  // resetState left the app at the unconfigured baseline (no selected model, no connections), so
  // `computeReadiness` returns `unconfigured` and the WelcomePanel is shown.
  await page.goto('/');

  // The welcome panel's h1 is the first thing on screen when the app is unconfigured.
  await expect(page.getByRole('heading', { level: 1, name: /welcome to anvika/i })).toBeVisible();

  // The composer (textarea labelled "Message") must not be visible on the welcome panel -
  // it is gated until the app is configured (readiness !== 'unconfigured').
  await expect(page.getByLabel('Message')).toHaveCount(0);

  // Zero axe violations on the welcome panel itself. Scan BEFORE navigating to Settings -
  // AxeBuilder analyses the current page, so running it after the click would scan the Settings
  // page instead of the welcome panel this test is here to verify.
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // The welcome panel offers a client-side link to Settings.
  await page.getByRole('link', { name: /open settings/i }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('a configured assistant display name persists across reload', async ({ page }) => {
  await page.goto('/settings');

  // The form only renders once the settings store has hydrated (the "Loading settings..." status is
  // replaced by the form). The announcement-period spinbutton is the ready-signal used by
  // settings-persistence.spec.ts - mirror it here.
  await expect(page.getByRole('spinbutton', { name: /announcement period/i })).toBeVisible();

  // Arm the wait for the PATCH response before blurring, so the response cannot be missed
  // (same technique as settings-persistence.spec.ts).
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/settings') &&
      r.request().method() === 'PATCH' &&
      r.status() === 200,
  );

  const assistant = page.getByLabel('Assistant name');
  await assistant.fill('Claude');
  await assistant.blur();
  await saved;

  // Reload: the post-reload GET is the source of truth, so the server must return the saved value.
  await page.reload();

  await expect(page.getByLabel('Assistant name')).toHaveValue('Claude');
});
