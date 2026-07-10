import { afterEach, describe, expect, test, vi } from 'vitest';

import { createMenuAccessKeyHandler } from './menuAccessKeys';

/** Mount a div with the given id into the document body and return it. */
function mountTarget(id: string): HTMLDivElement {
  const div = document.createElement('div');
  div.id = id;
  document.body.appendChild(div);
  return div;
}

/**
 * Build a fake `onKeyDown` event with the given key and no modifiers by default, with a `preventDefault`
 * spy so the handler's consume-or-ignore decision can be asserted.
 */
function fakeEvent(
  key: string,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {},
): {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
} {
  return {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    altKey: modifiers.altKey ?? false,
    preventDefault: vi.fn(),
  };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('createMenuAccessKeyHandler', () => {
  test('a bare matching letter clicks the mapped element and prevents default', () => {
    const target = mountTarget('item-pin');
    const click = vi.spyOn(target, 'click');
    const handler = createMenuAccessKeyHandler({ p: 'item-pin' });
    const event = fakeEvent('p');

    handler(event as never);

    expect(click).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  test('a modifier combination is ignored (no click, no preventDefault)', () => {
    const target = mountTarget('item-pin');
    const click = vi.spyOn(target, 'click');
    const handler = createMenuAccessKeyHandler({ p: 'item-pin' });

    for (const event of [
      fakeEvent('p', { ctrlKey: true }),
      fakeEvent('p', { metaKey: true }),
      fakeEvent('p', { altKey: true }),
    ]) {
      handler(event as never);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(click).not.toHaveBeenCalled();
  });

  test('a bare letter not in the map is ignored (no click, no preventDefault)', () => {
    const target = mountTarget('item-pin');
    const click = vi.spyOn(target, 'click');
    const handler = createMenuAccessKeyHandler({ p: 'item-pin' });
    const event = fakeEvent('x');

    handler(event as never);

    expect(click).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  test('matching is case-insensitive: an uppercase key matches a lowercase map entry', () => {
    const target = mountTarget('item-pin');
    const click = vi.spyOn(target, 'click');
    const handler = createMenuAccessKeyHandler({ p: 'item-pin' });
    const event = fakeEvent('P');

    handler(event as never);

    expect(click).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});
