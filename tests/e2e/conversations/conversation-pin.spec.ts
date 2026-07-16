import { expect, test } from '@playwright/test';
import { resetState } from '../support/reset';
import { seedSettings } from '../support/seed';

/**
 * Pin/unpin e2e for the sectioned conversation nav. Pinning is pure metadata and touches no model, so
 * this spec is credential-free and ALWAYS runs (it never self-skips).
 *
 * Seeding: the readiness gate hides the conversation surface (and its nav) until the app is configured,
 * so we first seed a placeholder connection WITH a manual model id and SELECT it (the models service
 * unions manual ids with fail-soft discovery, so a keyless placeholder still offers the model and
 * readiness resolves to ready). We then seed one
 * persisted conversation WITHOUT a model by PATCHing its reasoning override: that endpoint's
 * create-if-absent path mints an empty-messages revision-1 row for a fresh id, which surfaces in the
 * conversation list under the default "New conversation" title - exactly what we need to drive the
 * per-row context menu. The nav renders that title as a `link`, distinct from the New conversation
 * `button`, so role-scoped link queries stay unambiguous.
 */

/** A fixed, valid `xxx-xxx` conversation id (Crockford base32 lowercase) to seed and target. */
const CONVERSATION_ID = 'aaa-aaa';

/** The default title the create-if-absent seed gives an empty conversation; the nav link's name. */
const TITLE = 'New conversation';

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('pin and unpin a conversation in the sectioned nav', async ({ page, request }) => {
  // Configure the app so the conversation surface renders, with a SELECTED model. The manual model id
  // surfaces via the fail-soft models union; the refused localhost base URL never reaches a provider.
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

  // Seed one persisted conversation with no model: the reasoning-override endpoint create-if-absent
  // path writes an empty-messages revision-1 row for a fresh id.
  const seeded = await request.patch(`/api/v1/conversations/${CONVERSATION_ID}/reasoning`, {
    data: { reasoningOverride: null },
  });
  expect(seeded.ok()).toBeTruthy();

  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Conversations List' });
  // The Recent section starts expanded and lists this conversation (its row, unpinned, is just the
  // title). Use it as the context-menu target.
  const recentRow = nav.getByRole('link', { name: TITLE, exact: true }).first();
  await expect(recentRow).toBeVisible();

  // Open the per-row context menu (Radix ContextMenu trigger fires on the contextmenu event, which a
  // right-click dispatches - the same gesture as the Applications key / Shift+F10) and choose Pin.
  await recentRow.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pin' }).click();

  // The Pinned section appears as a labelled region containing a link to the conversation. Pinned
  // starts expanded, so its panel (region) is in the a11y tree.
  const pinned = page.getByRole('region', { name: 'Pinned' });
  await expect(pinned).toBeVisible();
  await expect(pinned.getByRole('link', { name: TITLE, exact: true })).toBeVisible();

  // Outside the Pinned section the same conversation's link name gains a " (Pinned)" suffix. The
  // Recent section also starts expanded, so assert the suffixed link is present in the nav.
  const suffixed = nav.getByRole('link', { name: `${TITLE} (Pinned)`, exact: true }).first();
  await expect(suffixed).toBeVisible();

  // Pinning from a NON-Pinned section leaves that row in place (it only gains the suffix), so focus
  // stays on this same conversation's row rather than jumping away.
  await expect(suffixed).toBeFocused();

  // Unpin via the same gesture. Target the Pinned region's row so the click is unambiguous.
  await pinned.getByRole('link', { name: TITLE, exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Unpin' }).click();

  // The Pinned section is omitted once no conversation is pinned (a fresh e2e DB has only this one).
  await expect(page.getByRole('region', { name: 'Pinned' })).toHaveCount(0);
  // And the suffixed name is gone from the nav.
  await expect(nav.getByRole('link', { name: `${TITLE} (Pinned)`, exact: true })).toHaveCount(0);

  // Unpinning from the Pinned section unmounts the row that was the menu trigger, so Radix's
  // focus-restore-to-trigger would land on a detached node and fall to <body>. With no pinned
  // conversation left to receive focus, the row flow moves focus to the list heading instead, so a
  // keyboard or screen-reader user lands on the "Conversations" heading rather than on <body>.
  await expect(page.getByRole('heading', { name: 'Conversations', level: 2 })).toBeFocused();
});
