import { afterEach, expect, test, vi } from 'vitest';

import { announce } from './announce';

/**
 * Force the fallback path by shadowing any native `document.ariaNotify` (it is a prototype accessor
 * in real Chromium, so `delete` alone cannot hide it) with an own `undefined` property. Using
 * `defineProperty` also sidesteps `exactOptionalPropertyTypes`, which forbids a bare `= undefined`.
 */
function forceFallback(): void {
  Object.defineProperty(document, 'ariaNotify', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

/** Drop any own-property override so the captured/native `ariaNotify` is restored. */
function restoreAriaNotify(original: Document['ariaNotify']): void {
  delete document.ariaNotify;
  if (original && document.ariaNotify !== original) document.ariaNotify = original;
}

afterEach(() => {
  // Remove any fallback region so each case starts from a clean DOM.
  document.querySelectorAll('[data-anvika-live]').forEach((el) => el.remove());
});

test('uses document.ariaNotify when available, passing the priority', () => {
  const original = document.ariaNotify;
  const spy = vi.fn();
  document.ariaNotify = spy;
  try {
    announce('Generating response', 'normal');
    announce('Boom', 'high');
    expect(spy).toHaveBeenNthCalledWith(1, 'Generating response', { priority: 'normal' });
    expect(spy).toHaveBeenNthCalledWith(2, 'Boom', { priority: 'high' });
  } finally {
    restoreAriaNotify(original);
  }
});

test('falls back to an aria-live region that re-announces identical messages', () => {
  const original = document.ariaNotify;
  forceFallback();
  try {
    announce('Response complete');
    const region = document.querySelector('[data-anvika-live]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-live')).toBe('polite');

    // The spoken message lives in a non-hidden span and is exactly the message - the nonce is NOT
    // part of it (otherwise VoiceOver would read "Response complete 42").
    const messageEl = region?.querySelector('span:not([aria-hidden])');
    expect(messageEl?.textContent).toBe('Response complete');
    const nonceEl = region?.querySelector('span[aria-hidden="true"]');
    expect(nonceEl).not.toBeNull();

    // An identical second message must mutate the region (via the nonce) so the AT re-announces,
    // while the spoken message span stays clean.
    const firstNonce = nonceEl?.textContent ?? '';
    announce('Response complete');
    expect(nonceEl?.textContent).not.toBe(firstNonce);
    expect(messageEl?.textContent).toBe('Response complete');

    // High priority switches the region to assertive.
    announce('Boom', 'high');
    expect(region?.getAttribute('aria-live')).toBe('assertive');
    expect(messageEl?.textContent).toBe('Boom');
  } finally {
    restoreAriaNotify(original);
  }
});
