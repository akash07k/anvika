import { Link } from '@tanstack/react-router';
import type { ReactElement, RefObject } from 'react';

import { isNoModelError } from './isNoModelError';
import { ApiClientError } from '../lib/api-client';

/** Props for {@link ChatErrorRegion}. */
export interface ChatErrorRegionProps {
  /** The current chat error to surface, or `undefined` for none. */
  error: Error | undefined;
  /** Ref for the Settings link, focused for a no-model error. */
  settingsLinkRef: RefObject<HTMLAnchorElement | null>;
  /** Ref for the Retry button, focused for a generic error. */
  retryRef: RefObject<HTMLButtonElement | null>;
  /** Invoked when the user activates Retry. */
  onRetry: () => void;
  /** The current turn's correlation id. When set and the error is a mid-stream (non-HTTP) error, a
   *  "Reference: <id>" line is shown (not spoken) - a non-live `<p>` the screen reader can navigate
   *  to on demand (not a tab stop) so the user can quote it for support. */
  requestId?: string;
}

/**
 * The chat error surface: a non-live (NOT `role="alert"`) region showing the error text, a
 * client-side Settings link for a no-model error, and a Retry button. The announcement is the single
 * spoken source, so this region stays silent and never double-speaks. Renders `null` when
 * there is no error.
 *
 * @param props - {@link ChatErrorRegionProps}.
 * @returns The error region, or `null` when there is no error.
 */
export function ChatErrorRegion({
  error,
  settingsLinkRef,
  retryRef,
  onRetry,
  requestId,
}: ChatErrorRegionProps): ReactElement | null {
  if (!error) return null;
  return (
    <div>
      {/* Non-live (no role="alert"): the announcement is the single spoken source. */}
      <p>{error.message}</p>
      {/* Shown, not spoken: a correlation id for a mid-stream error (the server logged the same id).
          Hidden for an ApiClientError, whose canonical message is self-explanatory. */}
      {requestId && !(error instanceof ApiClientError) ? <p>Reference: {requestId}</p> : null}
      {/* A no-model error points to Settings (focused); Retry is always kept. A router `<Link>`
          (not a plain anchor) so it navigates client-side without a full page reload. */}
      {isNoModelError(error) ? (
        <Link to="/settings" ref={settingsLinkRef}>
          Open Settings
        </Link>
      ) : null}
      <button type="button" ref={retryRef} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
