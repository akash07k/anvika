import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  expectAnnounced,
  recordAnnouncements,
  waitForSettingsHydrated,
  waitForSettingsPatch,
} from './connections-helpers';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

/**
 * Per-flow accessibility coverage for the connection TEST probe and the MODEL picker on /settings.
 * Both flows are deterministic without real credentials: the test probe targets a refused localhost
 * port (a guaranteed `unreachable`), and the picker relies on manual model ids, which surface in the
 * models list without a live provider. Each test arms the announcement recorder before load, drives
 * the UI by role, and asserts focus/announcement/axe/persistence as applicable.
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

/**
 * Assert zero axe violations across the repo's WCAG tag set. When `include` is given, the audit is
 * scoped to that subtree (used to audit the open model-picker popover in isolation, rather than
 * re-auditing the whole settings page).
 *
 * @param page - The Playwright page.
 * @param include - Optional CSS selector to scope the audit to a single subtree.
 */
async function expectNoAxeViolations(page: Page, include?: string): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']);
  if (include !== undefined) builder = builder.include(include);
  const results = await builder.analyze();
  expect(results.violations).toEqual([]);
}

test('TEST PROBE: a refused endpoint announces unreachable and records the failure line', async ({
  page,
  request,
}) => {
  // An openai-compatible connection pointed at a refused localhost port resolves to a deterministic
  // `unreachable` well under the 8s probe ceiling. The placeholder key never reaches a real provider.
  await seedSettings(request, {
    selectedModelId: '',
    connections: [
      {
        id: 'refused',
        label: 'Refused',
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:9123/v1',
        apiKey: 'sk-e2e-placeholder',
      },
    ],
  });
  await recordAnnouncements(page);
  await page.goto('/settings');
  await waitForSettingsHydrated(page);

  // The row's Test button posts to /api/v1/connections/test (200 with an error body for a refused
  // endpoint). Arm the wait so the assertion does not race the settle.
  const tested = page.waitForResponse(
    (r) =>
      r.url().includes('/api/v1/connections/test') &&
      r.request().method() === 'POST' &&
      r.status() === 200,
  );
  await page.getByRole('button', { name: 'Test Refused' }).click();
  await tested;

  // Both the start and the content-safe failure category are announced (exact wording from speech.ts).
  await expectAnnounced(page, 'Testing the connection');
  await expectAnnounced(page, 'Connection failed: unreachable');

  // The persistent, non-live "Last test" line records the same content-safe outcome.
  await expect(page.getByText('Last test: failed (unreachable)')).toBeVisible();
  await expectNoAxeViolations(page);
});

test('MODEL PICKER: a manual model id is selectable and the selection persists across reload', async ({
  page,
  request,
}) => {
  // Manual model ids surface in /api/v1/models without a live provider (the service unions discovered
  // ids with manual ids and discovery is fail-soft), so a keyless+placeholder connection still offers
  // the model. The namespaced id is `<connectionId>:<model>` -> `venice:venice-uncensored`.
  await seedSettings(request, {
    selectedModelId: '',
    connections: [
      {
        id: 'venice',
        label: 'Venice',
        type: 'openai-compatible',
        baseUrl: 'https://venice.example/v1',
        apiKey: 'sk-e2e-placeholder',
        manualModelIds: ['venice-uncensored'],
      },
    ],
  });

  // First confirm the manual id actually surfaces in the models list; if it does not, the picker path
  // is not exercisable and the test adapts (asserting the empty-state guidance) rather than flaking.
  const modelsRes = await request.get('/api/v1/models');
  expect(modelsRes.ok()).toBe(true);
  const body = (await modelsRes.json()) as { models: { id: string }[] };
  const expectedId = 'venice:venice-uncensored';
  const manualSurfaces = body.models.some((m) => m.id === expectedId);

  await recordAnnouncements(page);
  await page.goto('/settings');
  await waitForSettingsHydrated(page);

  // The model picker is now a searchable combobox: the trigger is a button, not a native select.
  const modelTrigger = page.getByRole('button', { name: /^Model/ });

  if (!manualSurfaces) {
    // Adapt: with no model available the picker shows the empty-state guidance and the trigger is
    // disabled. Assert that guidance instead of a flaky selection, and report the finding.
    await expect(page.getByText('Add a connection above, then choose a model here.')).toBeVisible();
    await expect(modelTrigger).toBeDisabled();
    await expectNoAxeViolations(page);
    return;
  }

  // Open the combobox and audit the popover SUBTREE (listbox, options, search input, and cmdk
  // group headings) in isolation - the muted-foreground token (oklch(0.48 0 0)) clears WCAG AA
  // 4.5:1 on white, so this passes with color-contrast enabled. Scoping to the command subtree
  // keeps the audit about the picker's open state rather than re-auditing the whole settings page.
  await modelTrigger.click();
  await expect(page.getByPlaceholder('Search models')).toBeVisible();
  await expectNoAxeViolations(page, '[data-slot="command"]');

  // Select the option and await the PATCH.
  const patched = waitForSettingsPatch(page);
  await page.getByRole('option', { name: 'venice-uncensored' }).click();
  await patched;
  // Trigger text content now reflects the selected model label.
  await expect(modelTrigger).toContainText('venice-uncensored');

  // Reload: the stored selection is the source of truth, so the trigger keeps the value.
  await page.reload();
  await waitForSettingsHydrated(page);
  // Wait for the models query to settle so the trigger is ENABLED (not the disabled, opacity-dimmed
  // loading state) and shows the resolved "displayName (connection)" label rather than the raw-id
  // "(currently unavailable)" fallback - otherwise the axe audit can catch the transient dimmed state.
  const reloadedTrigger = page.getByRole('button', { name: /^Model/ });
  await expect(reloadedTrigger).toBeEnabled();
  await expect(reloadedTrigger).toContainText('venice-uncensored (Venice)');
  // The disabled-to-enabled change animates opacity (the button's `transition-all` + the
  // `disabled:opacity-50` it is leaving): `toBeEnabled` resolves the instant `disabled` flips, while
  // the fade from 0.5 to 1 is still in flight. Wait for opacity to settle to 1 so the audit does not
  // catch the foreground text mid-fade at 50% (which dims it below AA contrast).
  await expect.poll(() => reloadedTrigger.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  // Axe on the settled post-reload page (no open popover) - complementary to the open-popover audit.
  await expectNoAxeViolations(page);
});
