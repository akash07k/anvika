import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/**
 * The surface shown when the conversation on screen was deleted in ANOTHER tab. A FOCUSABLE,
 * non-live region (NOT an `aria-live` alert) mirroring the route's focusable load-error block: it
 * takes focus on mount so a screen-reader user lands on the explanation rather than being interrupted
 * mid-task. The message is CONTENT-SAFE - it names no title - and a link offers a fresh start.
 *
 * @returns The deleted-elsewhere surface.
 */
export function DeletedElsewhereNotice() {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
    return undefined;
  }, []);

  return (
    <section aria-label="Conversation deleted">
      <h1 ref={headingRef} tabIndex={-1}>
        Conversation deleted
      </h1>
      <p>This conversation was deleted in another tab.</p>
      <p>
        <Link to="/">Start a new conversation</Link>
      </p>
    </section>
  );
}
