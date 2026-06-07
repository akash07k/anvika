import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './context-menu';

// Smoke test for the vendored shadcn ContextMenu (Radix). It opens on the `contextmenu` event that a
// right-click AND the keyboard context-menu key (Applications / Shift+F10) both dispatch at the focused
// element, so it is keyboard- and screen-reader-reachable without a separate trigger button or extra
// tab stop (ADR 0031). `asChild` makes the focusable element itself the trigger, mirroring how a
// conversation `<Link>` will host its actions. Accessible queries only.

function Harness() {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button type="button">Conversation</button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>Rename</ContextMenuItem>
        <ContextMenuItem>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

test('opens on the contextmenu event, exposes menu items, Escape closes and returns focus', async () => {
  await render(<Harness />);
  const trigger = page.getByRole('button', { name: 'Conversation' });
  const el = trigger.element() as HTMLElement;
  el.focus();
  // The Applications key / Shift+F10 / right-click all dispatch `contextmenu` at the focused element.
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

  const menu = page.getByRole('menu');
  await expect.element(menu).toBeInTheDocument();
  await expect.element(page.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
  await expect.element(page.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});
