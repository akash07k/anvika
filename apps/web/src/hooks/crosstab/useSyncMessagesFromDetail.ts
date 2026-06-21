import { useEffect, useRef } from 'react';

import {
  focusedMessageDomId,
  restoreFocusAfterReseed,
} from '../../components/message/messageHeadingFocus';
import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { useConversationDetail } from '../../lib/conversation/conversationQueries';
import { notify } from '../../notifications/notifier';

/** Inputs for {@link useSyncMessagesFromDetail}. */
export interface SyncMessagesInput {
  /** The conversation on screen, or `undefined` for a draft (then the hook no-ops). */
  conversationId: string | undefined;
  /** Whether a turn is in flight here (`submitted` or `streaming`) - never re-seed mid-turn. */
  isBusy: boolean;
  /** Whether an inline message editor is open here - never re-seed under an open editor. */
  isEditing: boolean;
  /** This tab's current `useChat` messages, compared against the authoritative server detail to tell
   * this tab's own just-finished turn (adopt silently) from a remote change (re-seed). */
  messages: AnvikaUIMessage[];
  /** `useChat`'s `setMessages` - the re-seed lever. */
  setMessages: (messages: AnvikaUIMessage[]) => void;
}

/** Concatenate a message's text parts - the content-bearing signal a remote edit changes under an
 * otherwise stable message id. */
function messageText(message: AnvikaUIMessage): string {
  let text = '';
  for (const part of message.parts) if (part.type === 'text') text += part.text;
  return text;
}

/**
 * True when both transcripts are the same ordered sequence of (id, role, text). Server message ids
 * are persisted verbatim, but a remote EDIT can change a message's text under a stable id - and an
 * edit of a trailing user message can keep the length too - so the own-turn-vs-remote test compares
 * text as well as ids. An ids-only check would misread such an edit as this tab's own turn and
 * silently leave the transcript stale (this matches the spec's "ordered role + text" comparison).
 */
function sameTranscript(a: readonly AnvikaUIMessage[], b: readonly AnvikaUIMessage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (x.id !== y.id || x.role !== y.role || messageText(x) !== messageText(y)) return false;
  }
  return true;
}

/**
 * Live cross-tab transcript sync: when the authoritative conversation detail advances to a revision
 * this tab did not produce, re-seed `useChat` from it and announce once. The cross-tab
 * subscriber already invalidates `['conversation', id]` on a remote `conversation-updated`, so this
 * hook only reacts to the resulting fresh detail - it is transport-agnostic.
 *
 * Reconciliation: track the revision last applied. The effect does an integer
 * compare per render and only inspects the transcript when the revision advances (once per turn). On
 * an advance it compares (id, role, text) signatures: EQUAL means this tab's own just-finished turn
 * (adopt the revision silently, never announce); DIFFERENT means a remote change (re-seed via
 * `setMessages` + one content-safe announcement). Held while busy or editing; the latest detail is
 * applied on the next idle render (the detail query is the single source of truth, so "apply latest
 * on idle" is correct without a queue). Best-effort: a failed detail refetch leaves the transcript
 * intact, and the revision is adopted before the re-seed so a throwing `setMessages` cannot make the
 * effect retry the same revision every render.
 *
 * Focus safety: the common case (a remote append) keeps every existing message node, so focus and
 * reading position are preserved by React. When a remote *truncating* edit/regenerate removes the
 * exact message this tab has focus parked on, {@link restoreFocusAfterReseed} moves focus to the new
 * last message's heading so it never falls to `<body>`.
 *
 * @param input - See {@link SyncMessagesInput}.
 */
export function useSyncMessagesFromDetail({
  conversationId,
  isBusy,
  isEditing,
  messages,
  setMessages,
}: SyncMessagesInput): void {
  const detail = useConversationDetail(conversationId).data;
  // Sentinel -1: never applied (not yet idle or just mounted). On first idle render this will
  // always be < detail.revision (revisions are non-negative integers), so the transcript signature
  // check runs and either silently adopts (own-turn match) or re-seeds (remote divergence).
  const appliedRevisionRef = useRef<number>(-1);
  const messagesRef = useRef(messages);
  const setMessagesRef = useRef(setMessages);
  messagesRef.current = messages;
  setMessagesRef.current = setMessages;

  useEffect(() => {
    if (!detail) return;
    if (isBusy || isEditing) return;
    const rev = detail.revision;
    if (rev <= appliedRevisionRef.current) return;
    const next = detail.messages as AnvikaUIMessage[];
    // Adopt the revision first so this revision is never reconsidered, even if the re-seed below
    // throws - that keeps a faulty `setMessages` from re-running every render instead of once.
    appliedRevisionRef.current = rev;
    if (sameTranscript(next, messagesRef.current)) return; // this tab's own turn (or already shown)
    const focusedDomId = focusedMessageDomId(); // captured before the re-seed removes any node
    setMessagesRef.current(next);
    notify({ type: 'conversationUpdatedElsewhere' });
    restoreFocusAfterReseed(focusedDomId, next);
  }, [detail, isBusy, isEditing]);
}
