/**
 * E2E spec for the per-conversation model override (header picker) and the advanced new-conversation
 * dialog. Both tests are credential-free: they rely on manual model ids seeded via
 * `seedSettings`, which surface in `/api/v1/models` without a live provider. Each test starts from a
 * reset baseline (resetState in beforeEach deletes every conversation and resets settings), so the
 * shared serial SQLite DB is clean on entry and the conversations this spec creates need no per-test
 * cleanup. No real model call is made and no message text is ever asserted or logged.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { ALPHA } from './multi-conversation-helpers';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert zero axe violations across the repo's WCAG tag set. When `include` is given, the
 * audit is scoped to that subtree (used to audit the open model-picker popover in isolation).
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

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

// ---------------------------------------------------------------------------
// Shared seed - two manual model ids so there is a non-default to switch to
// ---------------------------------------------------------------------------

/**
 * Seed the Venice connection with two manual model ids AND the ALPHA conversation in one pass.
 * Using a single `seedSettings` call (with `venice:model-a` as the selected model) followed by
 * the reasoning-override create-if-absent and rename requests keeps the Venice connection alive
 * through the whole test - calling `seedConversations` separately would overwrite the settings
 * with the `local` connection it hardcodes, losing the Venice models.
 *
 * @param request - The Playwright API request context.
 */
async function seedVeniceWithAlpha(request: APIRequestContext): Promise<void> {
  await seedSettings(request, {
    selectedModelId: 'venice:model-a',
    connections: [
      {
        id: 'venice',
        label: 'Venice',
        type: 'openai-compatible',
        baseUrl: 'https://venice.example/v1',
        apiKey: 'sk-e2e-placeholder',
        manualModelIds: ['model-a', 'model-b'],
      },
    ],
  });
  // Mint the ALPHA conversation (create-if-absent via the reasoning endpoint, then title it).
  const seeded = await request.patch(`/api/v1/conversations/${ALPHA.id}/reasoning`, {
    data: { reasoningOverride: null },
  });
  expect(seeded.ok()).toBeTruthy();
  const titled = await request.patch(`/api/v1/conversations/${ALPHA.id}`, {
    data: { title: ALPHA.title },
  });
  expect(titled.ok()).toBeTruthy();
}

// ---------------------------------------------------------------------------
// Test A - header per-conversation model: select, persist, revert
// ---------------------------------------------------------------------------

test('header model picker: select override, persists across reload, reverts to default', async ({
  page,
  request,
}) => {
  await seedVeniceWithAlpha(request);

  // Guard: confirm venice:model-b actually surfaces before exercising the picker.
  const modelsRes = await request.get('/api/v1/models');
  expect(modelsRes.ok()).toBe(true);
  const body = (await modelsRes.json()) as { models: { id: string }[] };
  const manualSurfaces = body.models.some((m) => m.id === 'venice:model-b');
  await page.goto(`/c/${ALPHA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  const trigger = page.getByRole('button', { name: /^Model/ });

  if (!manualSurfaces) {
    // Adapt: without a model the picker is disabled; assert its empty/disabled state and stop.
    await expect(trigger).toBeDisabled();
    await expectNoAxeViolations(page);
    return;
  }

  // The header model trigger initially shows "Use default model" (no per-conversation override).
  await expect(trigger).toContainText('Use default model');

  // Open the picker, audit the popover subtree, then select model-b.
  await trigger.click();
  await expect(page.getByPlaceholder('Search models')).toBeVisible();
  await expectNoAxeViolations(page, '[data-slot="command"]');

  const overridePatch = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/conversations/${ALPHA.id}/model`) &&
      r.request().method() === 'PATCH',
  );
  await page.getByRole('option', { name: 'model-b' }).click();
  await overridePatch;

  // The trigger now reflects the selected override.
  await expect(trigger).toContainText('model-b');

  // Reload and assert the override survived.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  const reloadedTrigger = page.getByRole('button', { name: /^Model/ });
  await expect(reloadedTrigger).toBeEnabled();
  await expect(reloadedTrigger).toContainText('model-b');
  // Wait for the opacity animation to settle before auditing (the disabled-to-enabled transition
  // leaves the button mid-fade, which would dim the text below AA contrast).
  await expect.poll(() => reloadedTrigger.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await expectNoAxeViolations(page);

  // Revert to default: open the picker and select "Use default model".
  await reloadedTrigger.click();
  await expect(page.getByPlaceholder('Search models')).toBeVisible();

  const revertPatch = page.waitForResponse(
    (r) =>
      r.url().includes(`/api/v1/conversations/${ALPHA.id}/model`) &&
      r.request().method() === 'PATCH',
  );
  await page.getByRole('option', { name: 'Use default model' }).click();
  await revertPatch;

  // Trigger reverts to "Use default model".
  await expect(page.getByRole('button', { name: /^Model/ })).toContainText('Use default model');
});

// ---------------------------------------------------------------------------
// Test B - advanced dialog: Create focuses the composer with the chosen model
// ---------------------------------------------------------------------------

test('advanced new-conversation dialog: Create focuses composer and carries the chosen model', async ({
  page,
  request,
}) => {
  await seedVeniceWithAlpha(request);

  // Guard: same manualSurfaces check as Test A.
  const modelsRes = await request.get('/api/v1/models');
  expect(modelsRes.ok()).toBe(true);
  const body = (await modelsRes.json()) as { models: { id: string }[] };
  const manualSurfaces = body.models.some((m) => m.id === 'venice:model-b');
  await page.goto(`/c/${ALPHA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  // Open the advanced new-conversation dialog via the button (preferred over hotkey for headless
  // Chromium reliability; Alt+Shift+N assertion is omitted because the hotkey depends on OS-level
  // focus and is flaky in headless environments).
  await page.getByRole('button', { name: 'New conversation with options' }).click();

  // The dialog opens with its title and the expected fields.
  const dialog = page.getByRole('dialog', { name: 'New conversation' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Title (optional)' })).toBeVisible();

  // The Model picker in the dialog starts at "Use default model".
  await expect(dialog.getByRole('button', { name: /^Model/ })).toBeVisible();
  await expect(dialog.getByText('Use default model')).toBeVisible();

  if (manualSurfaces) {
    // Pick model-b in the dialog's model picker.
    await dialog.getByRole('button', { name: /^Model/ }).click();
    await expect(page.getByPlaceholder('Search models')).toBeVisible();
    await page.getByRole('option', { name: 'model-b' }).click();
    // The picker closes; the trigger now shows model-b.
    await expect(dialog.getByRole('button', { name: /^Model/ })).toContainText('model-b');
  }

  // Type a title (asserting DOM-visible text is content-safe; we assert the H1 later, not
  // announcement text or log output).
  await dialog.getByRole('textbox', { name: 'Title (optional)' }).fill('E2E test conversation');

  // Set up a wait for the title-rename PATCH (the durable persist) before clicking Create. The regex
  // matches the bare `/conversations/:id` rename endpoint, not the `/model` or `/reasoning` sub-routes.
  const renamePatch = page.waitForResponse(
    (r) =>
      /\/api\/v1\/conversations\/[a-z0-9-]+$/.test(r.url()) && r.request().method() === 'PATCH',
  );

  // Click Create: the dialog closes, navigates to the new conversation, and lands focus in the
  // composer DURABLY. `useRouteFocus` yields to the composer-focus intent (it no longer steals focus
  // to the H1 at its 50ms timer when the composer already holds it), so this is the stable end state,
  // not a transient pre-timer window. Assert via the page JS context (`document.activeElement.id`)
  // because Playwright's `toBeFocused` can report "inactive" in headless Chromium.
  await dialog.getByRole('button', { name: 'Create' }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'composer', undefined, {
    timeout: 3000,
  });
  // Confirm focus durability: wait past the 50ms route-focus timer and re-check the composer holds it.
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('composer');

  // The H1 reflects the chosen title immediately (optimistic, from the draft store).
  await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E test conversation');

  // Durable persistence: wait for the title rename to land, then RELOAD (clearing the client draft
  // store) and assert the title AND the chosen model survive from the persisted server row.
  await renamePatch;
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E test conversation');
  if (manualSurfaces) {
    const headerTrigger = page.getByRole('button', { name: /^Model/ });
    await expect(headerTrigger).toBeEnabled();
    await expect(headerTrigger).toContainText('model-b');
  }
});
