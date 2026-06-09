import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { HotkeysProvider, useHotkeys } from 'react-hotkeys-hook';
import { expect, test, vi } from 'vitest';

/**
 * Probe component that binds the `stop` combination (`shift+escape`) and calls back when it fires.
 * Used by the smoke test to confirm react-hotkeys-hook v5 recognises the `escape` token in a real
 * browser, since the docs accept both `esc` and `escape` and we must not guess.
 */
function Probe({ onFire }: { onFire: () => void }) {
  useHotkeys('shift+escape', onFire, { preventDefault: true });
  return <button type="button">probe</button>;
}

test('react-hotkeys-hook fires on a real shift+escape', async () => {
  const onFire = vi.fn();
  await render(
    <HotkeysProvider initiallyActiveScopes={['*']}>
      <Probe onFire={onFire} />
    </HotkeysProvider>,
  );
  await userEvent.keyboard('{Shift>}{Escape}{/Shift}');
  expect(onFire).toHaveBeenCalled();
});

/**
 * Probe binding the send-key-mode toggle combination (`alt+enter`), to confirm in a real browser
 * that it is a valid react-hotkeys-hook token that fires.
 */
function ToggleProbe({ onFire }: { onFire: () => void }) {
  useHotkeys('alt+enter', onFire, { preventDefault: true });
  return <button type="button">toggle probe</button>;
}

/**
 * Probe binding a plain `enter` (exactly like the Composer's send binding in `enter` mode). It must
 * NOT fire on Alt+Enter: react-hotkeys-hook matches modifiers strictly (`ignoreModifiers` defaults
 * to false), so the toggle never collides with sending. This is the safety property the Alt+Enter
 * binding relies on, proven here in a real browser rather than assumed.
 */
function EnterProbe({ onFire }: { onFire: () => void }) {
  useHotkeys('enter', onFire, { preventDefault: true, enableOnFormTags: ['TEXTAREA'] });
  return <textarea aria-label="enter probe" />;
}

test('react-hotkeys-hook fires on a real alt+enter', async () => {
  const onFire = vi.fn();
  await render(
    <HotkeysProvider initiallyActiveScopes={['*']}>
      <ToggleProbe onFire={onFire} />
    </HotkeysProvider>,
  );
  await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
  expect(onFire).toHaveBeenCalled();
});

test('alt+enter does not trigger a plain "enter" send binding (modifier strictness)', async () => {
  const onEnter = vi.fn();
  await render(
    <HotkeysProvider initiallyActiveScopes={['*']}>
      <EnterProbe onFire={onEnter} />
    </HotkeysProvider>,
  );
  await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
  expect(onEnter).not.toHaveBeenCalled();
});
