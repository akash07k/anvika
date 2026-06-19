import { messageDomId, type AnvikaUIMessage } from '../../lib/message/anvikaMessage';

/**
 * Keep keyboard and screen-reader focus oriented to a message heading (`#message-<domId>`) across the
 * two moments it would otherwise fall to `<body>`: when an inline editor closes, and when a cross-tab
 * re-seed removes the message that held focus. Each message heading is `tabIndex={-1}`, so it is
 * programmatically focusable; a missing node is always a safe no-op. (For the generic, message-agnostic
 * focus primitive see `lib/message/messageFocus.ts`; this module is specifically about message headings.)
 */

/** Prefix of a message heading's element id (`message-<domId>`). */
const HEADING_ID_PREFIX = 'message-';

/**
 * Move focus to a message's role heading (`#message-<domId>`), deferred one frame so the focus lands
 * AFTER the closing editor unmounts. Without the deferral, focusing during the same synchronous tick
 * that sets state-to-close races the unmount and focus can fall to `<body>`. A missing node is a safe
 * no-op.
 *
 * Used when an inline message editor closes (submit or cancel) so the keyboard and a screen reader's
 * reading caret return to the edited message rather than being stranded on the document body.
 *
 * @param domId - The message's stable DOM handle (from `messageDomId`); the heading id is `message-${domId}`.
 */
export function focusMessageHeading(domId: string): void {
  requestAnimationFrame(() => {
    document.getElementById(`${HEADING_ID_PREFIX}${domId}`)?.focus();
  });
}

/**
 * The stable DOM handle (`domId`) of the message heading that currently holds focus, or `null` when
 * focus is elsewhere (the composer, an editor, the page body). Read before a cross-tab re-seed so the
 * caller can tell whether the focused message is about to be removed.
 *
 * @returns The focused message's `domId`, or `null`.
 */
export function focusedMessageDomId(): string | null {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  const id = active?.id;
  return id && id.startsWith(HEADING_ID_PREFIX) ? id.slice(HEADING_ID_PREFIX.length) : null;
}

/**
 * Keep a screen reader's focus from falling to `<body>` when a cross-tab re-seed removes the message
 * it was on. The common case (a remote append) keeps the focused node, so this no-ops. When a remote
 * truncating edit/regenerate drops the focused message, move focus to the new last message's heading
 * so the keyboard and reading caret stay oriented to the conversation's current tail rather than
 * being stranded on the document body.
 *
 * @param focusedDomId - The `domId` that held focus before the re-seed (from {@link focusedMessageDomId}).
 * @param next - The transcript the re-seed applied.
 */
export function restoreFocusAfterReseed(
  focusedDomId: string | null,
  next: readonly AnvikaUIMessage[],
): void {
  if (focusedDomId === null) return;
  if (next.some((message, index) => messageDomId(message, index) === focusedDomId)) return;
  const lastIndex = next.length - 1;
  const last = next[lastIndex];
  if (last) focusMessageHeading(messageDomId(last, lastIndex));
}
