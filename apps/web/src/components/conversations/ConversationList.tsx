import { useConversationList } from '../../lib/conversation/conversationQueries';
import { AdvancedNewConversationButton } from './AdvancedNewConversationButton';
import { ConversationSections } from './ConversationSections';
import { NewConversationButton } from './NewConversationButton';
import { CONVERSATIONS_HEADING_ID } from './sectionRowFocus';

/** Props for {@link ConversationList}. */
export interface ConversationListProps {
  /** Called to open the advanced new-conversation dialog (button and Alt+Shift+N). Owned by AppShell. */
  onOpenAdvancedNew?: (() => void) | undefined;
}

/**
 * The conversation-list sidebar: a plain `nav` landmark (NOT the shadcn Sidebar or a
 * collapsible section, so its semantics stay simple and predictable for a screen reader) labelled
 * "Conversations List", holding the "Conversations" heading, the New conversation affordances, and
 * the conversation links. The landmark name is distinct from the heading so landmark navigation reads
 * "Conversations List" (a clearer destination) while the in-region heading stays "Conversations".
 *
 * Renders both the plain New conversation button (Alt+N, no dialog) and the advanced
 * {@link AdvancedNewConversationButton} (Alt+Shift+N, opens the dialog). The dialog open-state is
 * owned by AppShell; this component receives the open callback via {@link onOpenAdvancedNew}.
 *
 * The links are grouped by {@link ConversationSections} into an accordion of time-bucketed sections
 * (Pinned and Recent shortcuts plus the date archive), each a level-3 heading. The list comes from
 * {@link useConversationList}; while it is still loading or empty the landmark and its New conversation
 * buttons still render, so the create path is always reachable (an empty list renders no sections). A
 * draft with an empty title links under a stable "Untitled conversation" label.
 *
 * @param props - See {@link ConversationListProps}.
 * @returns The conversation-list nav.
 */
export function ConversationList({ onOpenAdvancedNew = () => undefined }: ConversationListProps) {
  const { data } = useConversationList();
  const conversations = data?.conversations ?? [];
  return (
    <nav aria-label="Conversations List" className="border-r">
      <h2 id={CONVERSATIONS_HEADING_ID} tabIndex={-1}>
        Conversations
      </h2>
      <NewConversationButton />
      <AdvancedNewConversationButton onClick={onOpenAdvancedNew} />
      <ConversationSections conversations={conversations} />
    </nav>
  );
}
