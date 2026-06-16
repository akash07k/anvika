import { useEffect, useRef } from 'react';

import type { ChatReadiness } from './useChatReadiness';
import { logDiag } from '../../diagnostics/logDiag';

/**
 * Log the resolved chat-readiness state exactly once per mount, the first time readiness leaves
 * `loading`. The emit is the content-safe `chatReadinessResolved` diagnostic (a single enum, no
 * settings values or secrets), so a support log shows whether the user reached a usable chat.
 *
 * @param readiness - The current chat readiness; the effect fires once it is no longer `loading`.
 */
export function useReadinessLog(readiness: ChatReadiness): void {
  const logged = useRef(false);
  useEffect(() => {
    if (!logged.current && readiness !== 'loading') {
      logged.current = true;
      logDiag({ type: 'chatReadinessResolved', state: readiness });
    }
    return undefined;
  }, [readiness]);
}
