import { createFileRoute } from '@tanstack/react-router';

import { ConversationView } from '../components/ConversationView';
import type { AnvikaUIMessage } from '../lib/message/anvikaMessage';
import { useConversationDetail } from '../lib/conversation/conversationQueries';
import { useDocumentTitle } from '../hooks/settings/useDocumentTitle';
import { useMarkActiveConversation } from '../hooks/conversation/useMarkActiveConversation';
import { UNTITLED_CONVERSATION_LABEL } from '../components/conversations/untitledLabel';

/** Suffix appended to every page title, matching the app's `<title> - Anvika` convention. */
const TITLE_SUFFIX = ' - Anvika';

/**
 * Derive the conversation surface's document title from the conversation's title. A screen reader
 * announces the page title on navigation and tab-switch, so it should reflect the active
 * conversation rather than a generic label. Formatted as `<title> - Anvika`, matching the app's
 * existing title convention. An empty title (a fresh draft) or an absent one (still loading) falls
 * back to the shared {@link UNTITLED_CONVERSATION_LABEL} so the tab never reads empty or `undefined`.
 *
 * @param title - The conversation's title from its detail, or `undefined` while the detail loads.
 * @returns The full document title to set (e.g. `'Trip planning - Anvika'`).
 */
function conversationDocumentTitle(title: string | undefined): string {
  const base = title?.trim() || UNTITLED_CONVERSATION_LABEL;
  return `${base}${TITLE_SUFFIX}`;
}

/** The per-conversation chat surface, addressed by id (`/c/:conversationId`). */
export const Route = createFileRoute('/c/$conversationId')({
  component: () => <ConversationRoute conversationId={Route.useParams().conversationId} />,
});

/**
 * Hydrate the conversation surface for the id in the URL.
 *
 * Mirrors the old gate's three states with the new id-keyed detail query: pending shows an
 * accessible loading status; a real load failure shows a focusable (non-live) error; loaded renders
 * `ConversationView` already hydrated. A `not-found` (404) detail resolves to `data === null` (a
 * success), a DRAFT id with no persisted row, so it renders an EMPTY draft surface rather than an
 * error. The page `h1` renders in every state so route focus lands on it, and the surface remounts
 * (`key`) when the id changes so it rehydrates for the new conversation.
 *
 * @param props - The route props.
 * @param props.conversationId - The conversation id from the URL.
 */
export function ConversationRoute({ conversationId }: { conversationId: string }) {
  const { data, isPending, isError, error } = useConversationDetail(conversationId);
  // Reflect the active conversation's title in the tab/page title so a screen reader announces it on
  // navigation. `data?.title` updates reactively after an AI-retitle or inline rename refreshes the
  // detail query; while loading or for a draft with no persisted title it falls back to the untitled
  // label. Pure UI display - never routed through the notification or log layer.
  useDocumentTitle(conversationDocumentTitle(data?.title));
  // Persist the active pointer when an existing conversation is shown (data present, not a pending
  // load, a draft 404 (`data === null`), or a real error), so a reload or restart restores the
  // conversation the user last opened. A draft is left for the server to mark active on its first turn.
  useMarkActiveConversation(conversationId, data != null);

  if (isPending) {
    return (
      <>
        <h1>Conversation</h1>
        <output>Loading conversation</output>
      </>
    );
  }
  // A draft 404 resolves to a success with `data === null`, so `isError` is now only a REAL failure
  // (network, 5xx, malformed body) - render the focusable error region for those.
  if (isError) {
    return (
      <>
        <h1>Conversation</h1>
        <p>Could not load the conversation: {error.message}</p>
      </>
    );
  }
  // Loaded (`data` present) or an empty draft (`data === null` on a 404). Persisted Anvika messages
  // carry `createdAt`, so they are structurally `AnvikaUIMessage[]`; downstream reads metadata
  // defensively, keeping older rows safe.
  const initialMessages = (data?.messages ?? []) as AnvikaUIMessage[];
  return (
    <ConversationView
      key={conversationId}
      conversationId={conversationId}
      initialMessages={initialMessages}
      title={data?.title ?? null}
    />
  );
}
