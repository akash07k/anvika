import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

const hasAzure = Boolean(
  process.env.ANVIKA_AZURE_API_KEY &&
  process.env.ANVIKA_AZURE_RESOURCE_NAME &&
  process.env.ANVIKA_AZURE_DEPLOYMENT,
);

// Re-enabled: chat resolves its model from settings (the server falls back to
// settings.selectedModelId when the request omits modelId), so the spec seeds settings via the API
// before sending instead of relying on the removed ANVIKA_AZURE_* env shim. Still gated on creds so
// credential-free CI skips cleanly.
test.skip(!hasAzure, 'requires Azure credentials in env (.env)');

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('persists the conversation across a page reload', async ({ page, request }) => {
  // Seed the owner's settings (Azure credential + selected model id) before the first navigation so
  // the server's settings-driven resolver finds a configured model for the UI-driven turn, which
  // sends only { text }. A single PATCH carries both: connections and selectedModelId are top-level
  // settings fields, deep-merged then re-validated server-side.
  const deployment = process.env.ANVIKA_AZURE_DEPLOYMENT ?? '';
  await seedSettings(request, {
    connections: [
      {
        id: 'azure-main',
        label: 'Azure',
        type: 'azure',
        apiKey: process.env.ANVIKA_AZURE_API_KEY,
        resourceName: process.env.ANVIKA_AZURE_RESOURCE_NAME,
        // Azure has no data-plane model listing, so membership comes solely from manual ids; list
        // the deployment so it appears in GET /api/v1/models and readiness can resolve to 'ready'.
        manualModelIds: [deployment],
      },
    ],
    selectedModelId: `azure-main:${deployment}`,
  });

  await page.goto('/');

  // The entry route redirects to `/c/:id` (active pointer, else most-recent, else a fresh draft);
  // the composer renders once the id-keyed detail query resolves (or 404s into an empty draft), so
  // waiting for the input is the ready-signal that the conversation surface has mounted.
  await expect(page).toHaveURL(/\/c\//);
  const composer = page.getByRole('textbox', { name: 'Message' });
  await expect(composer).toBeVisible();

  await composer.fill('Remember the number 42.');
  const send = page.getByRole('button', { name: 'Send' });
  await send.click();

  // Assert on the last assistant listitem - our just-sent turn's reply.
  const assistant = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Assistant' }) })
    .last();
  await expect(assistant).toBeVisible({ timeout: 30000 });
  await expect(assistant).toContainText(/\w/, { timeout: 30000 });

  // The turn is persisted in the stream's onFinish (server side), which lands only once the
  // stream fully completes. The composer is disabled while a response is in flight, so waiting
  // for Send to be enabled again confirms the stream finished - and thus the turn was saved -
  // before we reload. Reloading mid-stream would race the persistence write.
  await expect(send).toBeEnabled({ timeout: 30000 });

  // Reload: the entry route redirects to the just-persisted conversation (most-recent fallback,
  // since no active pointer is set yet) and the id-keyed detail query restores its messages.
  await page.reload();

  // Wait for the conversation surface to resolve again before asserting restoration.
  await expect(page).toHaveURL(/\/c\//);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  // Scope to the Messages list: the conversation-list nav now shows the conversation's title (derived
  // from this first message), so an unscoped match would also resolve to that nav link. Exact match
  // within the list because the assistant may echo the phrase (e.g. "...I will remember the number 42.").
  const messages = page.getByRole('list', { name: 'Messages' });
  await expect(messages.getByText('Remember the number 42.', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Assistant' }) })
      .last(),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
