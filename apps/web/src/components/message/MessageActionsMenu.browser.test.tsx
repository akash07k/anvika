import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

import { MessageActionsMenu } from './MessageActionsMenu';

// Real Chromium exercises the Radix DropdownMenu open, the menuitem roles/attributes, the
// click and single-key (`e`/`g`/`b`) activation, and the disabled state that jsdom cannot model
// (ADR 0013). Accessible queries only.

/** Open the menu by clicking its trigger and wait for the named item to mount. */
async function openMenu(triggerName: string, firstItemName: string): Promise<void> {
  await userEvent.click(page.getByRole('button', { name: triggerName }));
  await expect.element(page.getByRole('menuitem', { name: firstItemName })).toBeInTheDocument();
}

test('a screen-reader Browse-mode click on the Actions trigger opens the menu (event.detail-agnostic)', async () => {
  // The user-facing surface of the Radix Browse-mode fix: NVDA/JAWS activate the trigger with only a
  // synthesized click (no pointerdown). The fix opens on any click not preceded by a pointerdown,
  // regardless of `event.detail`. Dispatch a click with `detail: 1` (NOT 0) to prove it is agnostic.
  await render(
    <MessageActionsMenu
      idBase="message-u1"
      triggerLabel="Actions for your message"
      messageRole="user"
      isStreaming={false}
      onEdit={vi.fn()}
      onBranch={vi.fn()}
    />,
  );
  const trigger = page
    .getByRole('button', { name: 'Actions for your message' })
    .element() as HTMLElement;
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await expect.element(page.getByRole('menuitem', { name: 'Edit message' })).toBeInTheDocument();
});

test('a user row shows Edit and Branch but not Regenerate, with the right ids and keyshortcuts', async () => {
  await render(
    <MessageActionsMenu
      idBase="message-u1"
      triggerLabel="Actions for your message"
      messageRole="user"
      isStreaming={false}
      onEdit={vi.fn()}
      onBranch={vi.fn()}
    />,
  );
  await openMenu('Actions for your message', 'Edit message');
  const edit = page.getByRole('menuitem', { name: 'Edit message' });
  await expect.element(edit).toHaveAttribute('id', 'message-u1-action-edit');
  await expect.element(edit).toHaveAttribute('aria-keyshortcuts', 'E');
  await expect
    .element(page.getByRole('menuitem', { name: 'Branch from here' }))
    .toBeInTheDocument();
  // Regenerate is role-filtered out of a user row.
  expect(page.getByRole('menuitem', { name: 'Regenerate response' }).query()).toBeNull();
});

test('an assistant row shows Regenerate and Branch but not Edit, with the right ids and keyshortcuts', async () => {
  await render(
    <MessageActionsMenu
      idBase="message-a1"
      triggerLabel="Actions for Assistant's message"
      messageRole="assistant"
      isStreaming={false}
      onRegenerate={vi.fn()}
      onBranch={vi.fn()}
    />,
  );
  await openMenu("Actions for Assistant's message", 'Regenerate response');
  const regen = page.getByRole('menuitem', { name: 'Regenerate response' });
  await expect.element(regen).toHaveAttribute('id', 'message-a1-action-regenerate');
  await expect.element(regen).toHaveAttribute('aria-keyshortcuts', 'G');
  await expect
    .element(page.getByRole('menuitem', { name: 'Branch from here' }))
    .toBeInTheDocument();
  // Edit is role-filtered out of an assistant row.
  expect(page.getByRole('menuitem', { name: 'Edit message' }).query()).toBeNull();
});

test('the visible E shortcut is aria-hidden so it does not change the accessible name', async () => {
  await render(
    <MessageActionsMenu
      idBase="message-u1"
      triggerLabel="Actions for your message"
      messageRole="user"
      isStreaming={false}
      onEdit={vi.fn()}
    />,
  );
  await openMenu('Actions for your message', 'Edit message');
  const shortcut = page.getByText('E', { exact: true });
  await expect.element(shortcut).toHaveAttribute('aria-hidden', 'true');
});

test('pressing e activates Edit while the menu is open', async () => {
  const onEdit = vi.fn();
  await render(
    <MessageActionsMenu
      idBase="message-u1"
      triggerLabel="Actions for your message"
      messageRole="user"
      isStreaming={false}
      onEdit={onEdit}
      onBranch={vi.fn()}
    />,
  );
  await openMenu('Actions for your message', 'Edit message');
  await userEvent.keyboard('e');
  await vi.waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));
});

test('pressing g activates Regenerate while the menu is open', async () => {
  const onRegenerate = vi.fn();
  await render(
    <MessageActionsMenu
      idBase="message-a1"
      triggerLabel="Actions for Assistant's message"
      messageRole="assistant"
      isStreaming={false}
      onRegenerate={onRegenerate}
      onBranch={vi.fn()}
    />,
  );
  await openMenu("Actions for Assistant's message", 'Regenerate response');
  await userEvent.keyboard('g');
  await vi.waitFor(() => expect(onRegenerate).toHaveBeenCalledTimes(1));
});

test('clicking Branch from here calls onBranch', async () => {
  const onBranch = vi.fn();
  await render(
    <MessageActionsMenu
      idBase="message-u1"
      triggerLabel="Actions for your message"
      messageRole="user"
      isStreaming={false}
      onBranch={onBranch}
    />,
  );
  await openMenu('Actions for your message', 'Branch from here');
  await userEvent.click(page.getByRole('menuitem', { name: 'Branch from here' }));
  await vi.waitFor(() => expect(onBranch).toHaveBeenCalledTimes(1));
});

test('pressing b activates Branch while the menu is open', async () => {
  const onBranch = vi.fn();
  await render(
    <MessageActionsMenu
      idBase="message-u1"
      triggerLabel="Actions for your message"
      messageRole="user"
      isStreaming={false}
      onBranch={onBranch}
    />,
  );
  await openMenu('Actions for your message', 'Branch from here');
  await userEvent.keyboard('b');
  await vi.waitFor(() => expect(onBranch).toHaveBeenCalledTimes(1));
});

test('items are disabled while streaming and the e accelerator does not activate Edit', async () => {
  const onEdit = vi.fn();
  await render(
    <MessageActionsMenu
      idBase="message-u1"
      triggerLabel="Actions for your message"
      messageRole="user"
      isStreaming={true}
      onEdit={onEdit}
      onBranch={vi.fn()}
    />,
  );
  await openMenu('Actions for your message', 'Edit message');
  const item = page.getByRole('menuitem', { name: 'Edit message' });
  // Radix marks a disabled menuitem `aria-disabled` and ignores its activation; a disabled element is
  // not clickable in Playwright, so we prove non-activation through the keyboard accelerator instead.
  await expect.element(item).toHaveAttribute('aria-disabled', 'true');
  await userEvent.keyboard('e');
  expect(onEdit).not.toHaveBeenCalled();
});
