import { expect, test } from '@playwright/test';

import { ALPHA, seedConversations } from '../conversations/multi-conversation-helpers';
import { resetState } from '../support/reset';

/**
 * Composer-focus e2e: creating a new conversation must land keyboard focus in the composer - the
 * regression the one-shot focus-intent (Tasks 6-7) fixes. Credential-free: {@link seedConversations}
 * already seeds a placeholder model (`local:e2e-model`) so the conversation surface and its composer
 * textarea render without any real model call. The New-conversation button and the Alt+N hotkey share
 * the same create path (`useNewConversation` to `navigateToConversationAndFocusComposer`); this spec
 * drives both and asserts the composer (textarea, accessible name "Message") is focused on arrival.
 *
 * Each test starts from a reset baseline (resetState in beforeEach deletes every conversation and
 * resets settings), so this spec asserts only on the composer by accessible name, never on absolute
 * counts, and needs no per-test cleanup of the conversations it creates.
 */

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test('new conversation focuses the composer (button and Alt+N)', async ({ page, request }) => {
  await seedConversations(request, [ALPHA]);
  await page.goto(`/c/${ALPHA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();

  // The New conversation button creates a draft, navigates, and must focus the composer on arrival.
  await expect(async () => {
    await page.getByRole('button', { name: 'New conversation', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeFocused({ timeout: 1000 });
  }).toPass();

  // Alt+N (the `newConversation` binding) does the same via keyboard. Navigate back to a known
  // conversation first so the navigation is observable, then press the binding.
  await page.goto(`/c/${ALPHA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(async () => {
    await page.keyboard.press('Alt+n');
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeFocused({ timeout: 1000 });
  }).toPass();

  // A plain page reload must NOT focus the composer (focus is only taken on in-app navigation).
  await page.goto(`/c/${ALPHA.id}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message' })).not.toBeFocused();
});
