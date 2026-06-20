import { expect, test } from '@playwright/test';
import { ALPHA, BETA, seedConversations } from './multi-conversation-helpers';
import { resetState } from '../support/reset';

/**
 * Pinned-conversation keyboard-shortcut e2e: the three app-wide pinned bindings driven entirely from
 * the keyboard. Ctrl+Alt+P toggles the pin on the viewed conversation, Ctrl+Alt+1..0 switch to the
 * Nth-most-recently-pinned conversation (slot 1 the newest pin), and Ctrl+Alt+C moves focus into the
 * Pinned section. react-hotkeys-hook v5 matches the physical key code regardless of any AltGr-composed
 * character, so `Control+Alt+1` / `Control+Alt+p` / `Control+Alt+c` fire the bindings in headless
 * Chromium (the Windows-OS AltGr caveat does not apply to synthetic events).
 *
 * Credential-free and ALWAYS runs (never self-skips): pinning, switching, and focusing are pure
 * metadata and touch no model. The shared {@link seedConversations} helper seeds a SELECTED placeholder
 * model so the readiness gate resolves and the conversation surface (and its nav) renders, then seeds
 * the two conversations via the reasoning-override create-if-absent path with UNIQUE titles.
 *
 * Each test starts from a reset baseline (resetState in beforeEach), so the only conversations and
 * pins present are the ones this spec seeds and creates. It still asserts ONLY on the conversation it
 * pins itself, queried by accessible NAME, never by absolute counts. Because it pins ALPHA during its
 * own run (newest `pinnedAt`), ALPHA is slot 1 for Ctrl+Alt+1 at assertion time; no slot beyond 1 is
 * asserted.
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('pins, quick-switches, focuses, and unpins the pinned section by keyboard', async ({
  page,
  request,
}) => {
  await seedConversations(request, [ALPHA, BETA]);

  // 1. Pin the VIEWED conversation with Ctrl+Alt+P. The toggle acts on the conversation in the URL, so
  // view ALPHA, then press the binding. ALPHA then appears as a link inside the Pinned region.
  await page.goto(`/c/${ALPHA.id}`);
  await expect(page).toHaveURL(`/c/${ALPHA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  const pinned = page.getByRole('region', { name: 'Pinned' });
  await expect(async () => {
    await page.keyboard.press('Control+Alt+p');
    await expect(pinned.getByRole('link', { name: ALPHA.title, exact: true })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();

  // 2. Quick-switch with Ctrl+Alt+1: navigate AWAY first (to BETA) so a navigation is observable, then
  // press the slot-1 binding and land on ALPHA (the newest pin). Re-press until it lands: a single
  // keydown can be missed in the brief window while the hotkey effect re-subscribes after a route change.
  await page.goto(`/c/${BETA.id}`);
  await expect(page).toHaveURL(`/c/${BETA.id}`);
  await expect(async () => {
    await page.keyboard.press('Control+Alt+1');
    await expect(page).toHaveURL(`/c/${ALPHA.id}`, { timeout: 1000 });
  }).toPass();

  // 3. Focus the Pinned section with Ctrl+Alt+C: ALPHA is the active conversation after the switch, so
  // its pinned row carries `aria-current="page"` and receives focus.
  const activePinnedRow = pinned.locator('a[aria-current="page"]');
  await page.keyboard.press('Control+Alt+c');
  await expect(activePinnedRow).toBeFocused();

  // 4. Unpin with Ctrl+Alt+P: ALPHA is still the viewed conversation, so the toggle removes its pin.
  // ALPHA's pinned-row copy disappears (a robust assertion even if another spec left a different pin).
  await expect(async () => {
    await page.keyboard.press('Control+Alt+p');
    await expect(pinned.getByRole('link', { name: ALPHA.title, exact: true })).toHaveCount(0, {
      timeout: 1000,
    });
  }).toPass();
});
