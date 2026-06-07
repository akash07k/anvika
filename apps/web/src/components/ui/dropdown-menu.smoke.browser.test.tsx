import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

// Smoke test for the vendored shadcn DropdownMenu (Radix). Real Chromium exercises the keyboard
// open, the menu/menuitem roles, Escape-to-close, and focus-return that jsdom cannot model
// (ADR 0013). Accessible queries only.

function Harness() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>First action</DropdownMenuItem>
        <DropdownMenuItem>Second action</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

test('opens from the keyboard, exposes menu/menuitem roles, Escape closes and returns focus', async () => {
  await render(<Harness />);
  const trigger = page.getByRole('button', { name: 'Actions' });
  (trigger.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');

  const menu = page.getByRole('menu');
  await expect.element(menu).toBeInTheDocument();
  await expect.element(page.getByRole('menuitem', { name: 'First action' })).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

test('opens on a screen-reader Browse-mode click and is event.detail-agnostic', async () => {
  // NVDA Browse mode / JAWS Virtual mode activate the trigger with only a synthesized click - no
  // pointerdown, no keydown - so Radix alone never opens. The fix opens on a click NOT preceded by a
  // pointerdown, regardless of `event.detail` (real NVDA does not reliably synthesize detail === 0).
  // Dispatch a click with `detail: 1` (NOT 0) to prove the fix no longer depends on detail === 0.
  await render(<Harness />);
  const trigger = page.getByRole('button', { name: 'Actions' }).element() as HTMLButtonElement;

  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));

  await expect.element(page.getByRole('menu')).toBeInTheDocument();
  await expect.element(page.getByRole('menuitem', { name: 'First action' })).toBeInTheDocument();
});

test('a real mouse interaction still opens the menu and does not double-toggle it shut', async () => {
  // A real mouse click is pointerdown (Radix opens) + a trailing click. The trigger ignores a click
  // that WAS preceded by a pointerdown (tracked via `pointerDownRef`), so the menu stays open - only
  // an AT/Browse-mode click with no preceding pointerdown opens it. No double-toggle, detail-agnostic.
  await render(<Harness />);
  await userEvent.click(page.getByRole('button', { name: 'Actions' }));

  await expect.element(page.getByRole('menu')).toBeInTheDocument();
  await expect.element(page.getByRole('menuitem', { name: 'First action' })).toBeInTheDocument();
});
