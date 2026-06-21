import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

const hasAzure = Boolean(
  process.env.ANVIKA_AZURE_API_KEY &&
  process.env.ANVIKA_AZURE_RESOURCE_NAME &&
  process.env.ANVIKA_AZURE_DEPLOYMENT,
);

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

// Deterministic backstop that needs no real provider account. A per-message Copy button only exists
// once a message is rendered, and the one message we can render WITHOUT a reachable provider is the
// user's OWN message: sendMessage appends it to the list immediately on send - before any model call
// resolves - so MessageList renders its "Copy your message" button. The send then surfaces a
// connection error against the unreachable seeded base URL, but the user li and its Copy button stay.
//
// Clipboard READS are blocked in headless CI, so this never asserts on clipboard contents. It proves
// the control is keyboard-operable (focusable + Enter-activatable) and the surface is axe-clean -
// exactly the accessibility contract Plan C's CopyButton must satisfy.
test('a message Copy button is keyboard-operable and the surface is axe-clean', async ({
  page,
  request,
}) => {
  // The composer AND an enabled Send button are gated behind readiness, which is `unconfigured` after
  // resetState. Seed a placeholder `local` connection with a manual model id and SELECT it: the manual
  // id surfaces in /api/v1/models (the models service unions manual ids with fail-soft discovery), so
  // readiness resolves to `ready` and Send is enabled - even though the refused localhost base URL is
  // never reachable. The send then surfaces a connection error, but the user's own message li (and its
  // "Copy your message" button) is appended client-side before any model call resolves, which is all
  // this test needs.
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

  await page.goto('/');

  // The composer renders once the ConversationGate query resolves; waiting on it is the ready-signal.
  const composer = page.getByRole('textbox', { name: 'Message' });
  await expect(composer).toBeVisible();

  const sentText = 'Copy me with the keyboard.';
  await composer.fill(sentText);
  await page.getByRole('button', { name: 'Send' }).click();

  // The user turn renders immediately (client-side), giving us its "Copy your message" button. Scope
  // to the listitem holding our just-sent text so the query is unambiguous.
  const sentMessage = page
    .getByRole('listitem')
    .filter({ has: page.getByText(sentText, { exact: true }) });
  const copy = sentMessage.getByRole('button', { name: 'Copy your message' });
  await expect(copy).toBeVisible();
  await expect(copy).toBeEnabled();

  // Keyboard-only operation: focus the control, assert it took focus, then activate it with Enter.
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press('Enter');

  // The button remains a stable, operable control after activation (no clipboard read in headless CI).
  await expect(copy).toBeVisible();
  await expect(copy).toBeEnabled();

  // Zero axe violations on the rendered conversation surface (same pattern as smoke.spec.ts).
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

// Azure-gated companion: when credentials are present, cover the exact assistant-message Copy button
// ("Copy Assistant's message") end to end. Mirrors chat-live.spec.ts's seed-settings-then-send pattern,
// and skips cleanly on credential-free CI so the deterministic test above is always the backstop.
test('the assistant message Copy button is keyboard-operable', async ({ page, request }) => {
  test.skip(!hasAzure, 'requires Azure credentials in env (.env)');

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
  const send = page.getByRole('button', { name: 'Send' });
  await send.click();

  // Wait for the streamed assistant turn so its "Copy Assistant's message" button is in the DOM.
  const assistant = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Assistant' }) })
    .last();
  await expect(assistant).toBeVisible({ timeout: 30000 });
  await expect(assistant).toContainText(/\w/, { timeout: 30000 });

  // Let the stream fully settle before driving the keyboard: the composer is disabled mid-stream and
  // Send re-enables on completion, so this is the deterministic "no more re-renders" signal. Focusing
  // during the stream races React's re-render and leaves the button momentarily inactive.
  await expect(send).toBeEnabled({ timeout: 30000 });

  const copy = assistant.getByRole('button', { name: "Copy Assistant's message" });
  await expect(copy).toBeVisible();
  await expect(copy).toBeEnabled();

  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(copy).toBeVisible();
  await expect(copy).toBeEnabled();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
