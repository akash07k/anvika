import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

/**
 * Smoke test proving the Vitest Browser Mode project boots a real Chromium DOM where
 * focus is observable. The event-driven notification layer (ADR 0013) relies on
 * document.ariaNotify, real focus, and real keyboard events that jsdom cannot model, so
 * this guards that the browser project renders and focuses a real element.
 */
test('browser mode renders a real DOM with focus', async () => {
  const screen = await render(<button type="button">Hello</button>);
  const button = screen.getByRole('button', { name: 'Hello' });
  (button.element() as HTMLButtonElement).focus();
  await expect.element(button).toHaveFocus();
});
