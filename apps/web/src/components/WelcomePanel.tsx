import { Link } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/**
 * The first-run welcome panel, shown by the conversation surface when nothing is configured
 * (readiness `unconfigured`). It is the route's heading in that state, names the panel for a
 * screen reader by moving focus to the heading on mount (the app's focusable-heading announcement
 * pattern, which avoids a separate spoken announcement that would double-speak), and offers a
 * client-side link to Settings.
 */
export function WelcomePanel() {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  return (
    <section aria-label="Welcome">
      <h1 ref={headingRef} tabIndex={-1}>
        Welcome to Anvika
      </h1>
      <p>Add a connection and choose a model in Settings to start chatting.</p>
      <Link to="/settings">Open Settings</Link>
    </section>
  );
}
