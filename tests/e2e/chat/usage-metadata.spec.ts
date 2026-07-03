import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

const azureApiKey = process.env.ANVIKA_AZURE_API_KEY;
const azureResourceName = process.env.ANVIKA_AZURE_RESOURCE_NAME;
const azureDeployment = process.env.ANVIKA_AZURE_DEPLOYMENT;
const hasAzure = Boolean(azureApiKey && azureResourceName && azureDeployment);

test.skip(!hasAzure, 'requires Azure credentials in env (.env)');

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('a completed turn shows a usage disclosure that persists across reload', async ({
  page,
  request,
}) => {
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

  // The composer only renders once the ConversationGate query resolves (the "Loading
  // conversation..." status is replaced by the conversation surface), so waiting for the
  // input is the ready-signal that the gate has loaded.
  const composer = page.getByRole('textbox', { name: 'Message' });
  await expect(composer).toBeVisible();

  await composer.fill('Reply with the single word: hello.');
  const send = page.getByRole('button', { name: 'Send' });
  await send.click();

  // Assert on the last assistant listitem - our just-sent turn's reply. Filter by the ABSENCE of
  // "Copy your message" (the user-turn copy label) rather than by the heading text: the assistant
  // display name is a configurable setting, so a heading-text filter would be brittle. "Copy your
  // message" is a fixed accessible label that only appears on user turns.
  const assistant = page
    .getByRole('listitem')
    .filter({ hasNot: page.getByRole('button', { name: 'Copy your message' }) })
    .last();
  await expect(assistant).toBeVisible({ timeout: 30000 });
  await expect(assistant).toContainText(/\w/, { timeout: 30000 });

  // The turn is persisted in the stream's onFinish (server side), which lands only once the
  // stream fully completes. The composer is disabled while a response is in flight, so waiting
  // for Send to be enabled again confirms the stream finished - and thus the turn was saved -
  // before we assert usage or reload. Asserting on usage before the stream finishes would race
  // the finish-step seam where usage metadata is stamped.
  await expect(send).toBeEnabled({ timeout: 30000 });

  // The usage disclosure is a native <details> element. Its summary begins with "Usage:" and
  // is visible on the completed assistant turn. Azure models are unpriced, so we assert the
  // disclosure summary text (which includes token counts) but not a cost figure.
  await expect(assistant.getByText(/^Usage:/)).toBeVisible();

  // Reload: the usage rides the persisted UIMessage JSON (no separate table), so it must
  // survive a full browser reload, which re-hydrates the conversation from persistence.
  await page.reload();

  // Wait for the gate to resolve again before asserting restoration.
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  // The last assistant turn in the restored conversation must still carry its usage disclosure.
  // Same display-name-agnostic filter as above.
  const restoredAssistant = page
    .getByRole('listitem')
    .filter({ hasNot: page.getByRole('button', { name: 'Copy your message' }) })
    .last();
  await expect(restoredAssistant).toBeVisible();
  await expect(restoredAssistant.getByText(/^Usage:/)).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
