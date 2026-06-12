import { Link } from '@tanstack/react-router';

import type { ChatReadiness } from '../hooks/chat/useChatReadiness';

/** Props for {@link ChatReadinessNotice}. */
export interface ChatReadinessNoticeProps {
  /** The current chat readiness state; the notice renders only for `loading` and `model-unavailable`. */
  readiness: ChatReadiness;
}

/**
 * Contextual status notice rendered below the message list when the conversation surface is not
 * fully ready. Shows a brief "checking" status while loading and a recoverable notice with a
 * Settings link when the selected model is unavailable. Renders nothing in the `ready` and
 * `unconfigured` states (the latter is handled by the early-return `WelcomePanel` branch).
 */
export function ChatReadinessNotice({ readiness }: ChatReadinessNoticeProps) {
  if (readiness === 'loading') {
    return <output>Checking your model...</output>;
  }
  if (readiness === 'model-unavailable') {
    return (
      <p>
        Your selected model isn&apos;t available right now.{' '}
        <Link to="/settings">Open Settings</Link> to choose a model or check your local server.
      </p>
    );
  }
  return null;
}
