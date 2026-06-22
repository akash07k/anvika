import { useMemo } from 'react';

import { detectIsMac } from '../../lib/keyboard/keyboardHelpers';

/**
 * Resolve once whether the current platform is macOS so the shortcuts listing can show the Cmd
 * chord on Mac and the Ctrl chord elsewhere. Memoized: the platform never changes at
 * runtime. Delegates to {@link detectIsMac} (the single detection implementation) and returns
 * `false` in a non-browser environment where `navigator` is undefined.
 *
 * @returns `true` on macOS, `false` otherwise.
 */
export function useIsMac(): boolean {
  return useMemo(() => (typeof navigator === 'undefined' ? false : detectIsMac(navigator)), []);
}
