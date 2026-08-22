import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('conversation surface renders accessibly', async ({ page, request }) => {
  // The readiness gate shows WelcomePanel when the app is unconfigured. Seed a manual local model
  // instead of asserting the route's transient loading heading: it makes the loaded draft surface
  // ready without requiring a reachable model server, and keeps the model picker fully opaque for axe.
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
  await expect(page.getByRole('heading', { level: 1, name: 'New conversation' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Model\b/ })).toBeEnabled();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
