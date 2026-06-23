import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { HotkeysProvider, useHotkeys } from 'react-hotkeys-hook';
import { expect, test, vi } from 'vitest';

import { useGlobalShortcuts } from './useGlobalShortcuts';

/**
 * Probe component that mounts {@link useGlobalShortcuts} and renders a text input so the test can
 * confirm the hotkey fires even while the input has focus. Binding is
 * `alt+slash` - the react-hotkeys-hook token for the `/` key (`L(code)` maps `Slash` -> `slash`,
 * so the binding string must use `slash` not the bare `/` character).
 */
function Probe({ onOpen }: { onOpen: () => void }) {
  useGlobalShortcuts({ binding: 'alt+slash', onOpen });
  return <input aria-label="composer" />;
}

test('useGlobalShortcuts fires onOpen on Alt+/ even while a text input has focus', async () => {
  const onOpen = vi.fn();
  const { getByRole } = await render(
    <HotkeysProvider initiallyActiveScopes={['*']}>
      <Probe onOpen={onOpen} />
    </HotkeysProvider>,
  );
  const input = getByRole('textbox', { name: 'composer' });
  await userEvent.click(input);
  // '/' is a printable character; in userEvent keyboard notation, it is typed as a bare character
  // inside the modifier hold. `{Alt>}` holds Alt, `/` types the slash, `{/Alt}` releases Alt.
  await userEvent.keyboard('{Alt>}/{/Alt}');
  expect(onOpen).toHaveBeenCalledTimes(1);
});

/**
 * Smoke test: confirm react-hotkeys-hook v5 recognises the `alt+slash` token in a real browser.
 * react-hotkeys-hook maps `e.code` through `L()` (strips `key`/`digit`/`numpad` prefixes,
 * lowercases), so `Slash` -> `slash`. The binding string must use `slash`, not the bare `/`
 * character (which the library would store as `/` and never match against `slash`).
 */
function SlashProbe({ onFire }: { onFire: () => void }) {
  useHotkeys('alt+slash', onFire, { preventDefault: true });
  return <button type="button">probe</button>;
}

test('react-hotkeys-hook fires on a real alt+slash (the correct token for the / key)', async () => {
  const onFire = vi.fn();
  await render(
    <HotkeysProvider initiallyActiveScopes={['*']}>
      <SlashProbe onFire={onFire} />
    </HotkeysProvider>,
  );
  await userEvent.keyboard('{Alt>}/{/Alt}');
  expect(onFire).toHaveBeenCalled();
});
