import { expect, test } from '@playwright/test';
import {
  ALPHA,
  BETA,
  GAMMA,
  navOf,
  parseConversationIds,
  seedConversations,
} from './multi-conversation-helpers';
import { resetState } from '../support/reset';

/**
 * Multi-conversation management e2e: list rendering, switching (by list link and by the
 * Alt+Shift+1..0 quick-switch bindings), focusing the list (Alt+Shift+C), rename, delete-the-active
 * (navigate to the server's next active id), deep-link, and reload restore + root fallback. The axe
 * zero-violations sweep lives in `multi-conversation-axe.spec.ts`; the shared seed/helpers live in
 * `multi-conversation-helpers.ts`.
 *
 * Credential-free and ALWAYS runs (never self-skips): every flow here is pure metadata - create,
 * rename, delete, switch - and touches no model. We seed a SELECTED model so the readiness gate
 * resolves and the conversation surface (and its nav) renders, then seed three conversations via the
 * reasoning-override create-if-absent path and give each a UNIQUE title via rename.
 *
 * Each test starts from a reset baseline (resetState in beforeEach), so the only conversations present
 * are the ones this spec seeds. It still queries rows by their accessible NAME (the title) and never
 * asserts on absolute counts. The quick-switch shortcut (Alt+Shift+1..0) targets the Nth conversation
 * in the list's own server order (slot 1 = `conversations[0]`), so rather than hard-code which seeded
 * id is slot 1, the switch test reads the live list order from the API and drives its assertions off
 * the first two seeded ids in that order.
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('lists, switches by link, and quick-switches with Alt+Shift+digit', async ({
  page,
  request,
}) => {
  await seedConversations(request, [ALPHA, BETA, GAMMA]);
  await page.goto('/');
  await expect(page).toHaveURL(/\/c\//);

  const nav = navOf(page);
  const alphaRow = nav.getByRole('link', { name: ALPHA.title, exact: true });
  // 1. All three seeded conversations render in the nav.
  await expect(alphaRow).toBeVisible();
  await expect(nav.getByRole('link', { name: BETA.title, exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: GAMMA.title, exact: true })).toBeVisible();

  // 2. Switch by activating a list link (keyboard: focus then Enter).
  await alphaRow.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/c/${ALPHA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  // 3. Switch via the Alt+Shift+1/2 quick-switch bindings. The quick-switch shortcut targets the
  // Nth conversation in the list's own order (slot 1 = `conversations[0]`); read that live order from
  // the API so the assertions follow the server's ordering rather than a hard-coded assumption. The
  // list body is runtime-validated by {@link parseConversationIds} (boundary rule: no un-validated
  // cast), so the order is read off a checked shape. The bindings are `alt+shift+1`/`alt+shift+2`;
  // react-hotkeys-hook v5 matches the physical key code (Digit1/Digit2) regardless of the shifted
  // character, so `Alt+Shift+1` triggers them.
  const seededIds = new Set([ALPHA.id, BETA.id, GAMMA.id]);
  const listedIds = parseConversationIds(await (await request.get('/api/v1/conversations')).json());
  const order = listedIds.filter((id) => seededIds.has(id));
  const [slot1Id, slot2Id] = order;
  // Guard the slots are two distinct seeded ids, so the quick-switch assertions below are meaningful
  // (a navigation actually changes the URL) rather than vacuously satisfied by a no-op.
  expect(slot1Id).toBeDefined();
  expect(slot2Id).toBeDefined();
  expect(slot1Id).not.toBe(slot2Id);
  // Re-press until the navigation lands: a single keydown can be missed if it arrives in the brief
  // window while the hotkey effect re-subscribes after the route change, so poll the press. Start from
  // a different conversation than slot 1 so a navigation is actually observable.
  await page.goto(`/c/${slot2Id}`);
  await expect(page).toHaveURL(`/c/${slot2Id}`);
  await expect(async () => {
    await page.keyboard.press('Alt+Shift+1');
    await expect(page).toHaveURL(`/c/${slot1Id}`, { timeout: 1000 });
  }).toPass();
  await expect(async () => {
    await page.keyboard.press('Alt+Shift+2');
    await expect(page).toHaveURL(`/c/${slot2Id}`, { timeout: 1000 });
  }).toPass();

  // 4. Focus the list with Alt+Shift+C: lands on the active row (the currently-viewed conversation,
  // now slot 2). The shortcut targets the `aria-current="page"` link in the Conversations List nav.
  const activeRow = nav.locator('a[aria-current="page"]');
  await page.keyboard.press('Alt+Shift+c');
  await expect(activeRow).toBeFocused();
});

test('renames, deletes the active conversation, deep-links, and restores on reload', async ({
  page,
  request,
}) => {
  await seedConversations(request, [ALPHA, BETA, GAMMA]);
  const nav = navOf(page);
  const renamedTitle = 'Multinav Alpha Renamed';

  // 5. Rename Alpha via its context menu, then confirm the new title replaced the old in the nav.
  await page.goto('/');
  await expect(page).toHaveURL(/\/c\//);
  await nav.getByRole('link', { name: ALPHA.title, exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const renameField = page.getByRole('textbox', { name: 'Rename conversation' });
  await expect(renameField).toBeFocused();
  await renameField.fill(renamedTitle);
  await renameField.press('Enter');
  await expect(nav.getByRole('link', { name: renamedTitle, exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: ALPHA.title, exact: true })).toHaveCount(0);

  // 6. Delete the ACTIVE conversation: view Gamma, delete it, land on the server's next active id.
  await page.goto(`/c/${GAMMA.id}`);
  await expect(page).toHaveURL(`/c/${GAMMA.id}`);
  await nav.getByRole('link', { name: GAMMA.title, exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog', { name: 'Delete conversation?' }).waitFor();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(nav.getByRole('link', { name: GAMMA.title, exact: true })).toHaveCount(0);
  // The view navigated away from the deleted id to a surviving seeded conversation.
  await expect(page).not.toHaveURL(`/c/${GAMMA.id}`);
  await expect(page).toHaveURL(new RegExp(`/c/(${ALPHA.id}|${BETA.id})$`));

  // 7. Deep-link directly to Beta: the conversation surface mounts and the URL stays put.
  await page.goto(`/c/${BETA.id}`);
  await expect(page).toHaveURL(`/c/${BETA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  // 8a. Reload restore: the same `/c/:id` route and composer come back (URL-driven restore).
  await page.reload();
  await expect(page).toHaveURL(`/c/${BETA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  // 8b. Root fallback: entering at `/` redirects to some `/c/:id` (active/most-recent fallback).
  await page.goto('/');
  await expect(page).toHaveURL(/\/c\//);
});
