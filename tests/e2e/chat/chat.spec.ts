import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('conversation surface renders accessibly', async ({ page, request }) => {
  // The readiness gate shows the WelcomePanel (not the conversation surface) when the app is
  // unconfigured. After resetState the app is unconfigured, so seed a placeholder configured
  // connection here to reach a non-unconfigured (at least model-unavailable) state. seedSettings
  // PATCHes the public connection then PUTs its apiKey via the secret endpoint, so the placeholder
  // counts as a configured (keyed) connection under Option C.
  await seedSettings(request, {
    connections: [
      {
        id: 'anthropic',
        label: 'Anthropic',
        type: 'anthropic',
        apiKey: 'e2e-readiness-placeholder',
      },
    ],
  });

  await page.goto('/');
  // Exact match: the conversation-list nav adds an `<h2>Conversations</h2>`, so a substring match
  // would ambiguously resolve to both it and the surface's `<h1>Conversation</h1>`.
  await expect(page.getByRole('heading', { name: 'Conversation', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
