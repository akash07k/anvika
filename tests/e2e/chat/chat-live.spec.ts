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

test('sends a message and renders a streamed assistant reply', async ({ page, request }) => {
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
  await page.getByRole('textbox', { name: 'Message' }).fill('Reply with the single word: hello.');
  await page.getByRole('button', { name: 'Send' }).click();

  const assistant = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Assistant' }) });
  await expect(assistant).toBeVisible({ timeout: 30000 });
  await expect(assistant).toContainText(/\w/, { timeout: 30000 });
});
