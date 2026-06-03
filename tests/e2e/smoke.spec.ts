import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { resetState } from './support/reset';
import { seedSettings } from './support/seed';

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('app boots: health ok, shell renders, no axe violations', async ({ page, request }) => {
  // The readiness gate shows the WelcomePanel (not the conversation surface) when the app is
  // unconfigured. After resetState the app is unconfigured, so seed placeholder configured
  // connections here to reach a non-unconfigured (at least model-unavailable) state.
  // seedSettings PATCHes the public connections then PUTs each apiKey via the secret endpoint, so the
  // placeholders count as configured (keyed) connections under Option C. The `local` connection lists
  // a manual model id (so `/api/v1/models` is non-empty without a reachable server): that keeps the
  // conversation header's model picker ENABLED, since a disabled (empty-list) picker renders its text
  // through `disabled:opacity-50`, which axe reads as a false color-contrast failure even though WCAG
  // 1.4.3 exempts inactive controls.
  await seedSettings(request, {
    connections: [
      {
        id: 'anthropic',
        label: 'Anthropic',
        type: 'anthropic',
        apiKey: 'e2e-readiness-placeholder',
      },
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

  const health = await request.get('/api/v1/health');
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).status).toBe('ok');

  await page.goto('/');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  // The surface H1 now shows the conversation's real title (or "New conversation" for a draft), which
  // varies with the shared serial DB's state, so assert the level-1 heading exists rather than a fixed
  // string. Matching by level (not name) also avoids the conversation-list nav's `<h2>Conversations</h2>`.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Wait for the model picker to finish loading (it is disabled while `useModels` is pending); auditing
  // the transient loading state would read its opacity-50 text as a false color-contrast failure.
  await expect(page.locator('#conversation-model')).toBeEnabled();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
