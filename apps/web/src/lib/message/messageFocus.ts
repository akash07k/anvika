import { logDiag } from '../../diagnostics/logDiag';

/**
 * Delay before moving focus, so the focus lands a beat AFTER the keydown finishes rather than
 * synchronously inside it. A screen reader follows a programmatic focus change far more reliably when
 * it is not mid-processing the keystroke that triggered it (documented technique; see
 * docs/research/screen-reader-focus-management.md). Tunable. Shared by the conversation
 * navigate-and-focus helper so both deferred-focus paths use one source of truth.
 */
export const FOCUS_DELAY_MS = 50;

/**
 * Focus `el`, forcing a real focus event even when it ALREADY holds focus. A screen reader's
 * browse-mode reading caret moves independently of the system focus, so after the reader arrows away
 * from a navigation target the system focus still sits on it. A plain `.focus()` on the
 * already-focused element is a no-op that fires NO focus event, so the reading caret never returns and
 * re-pressing the shortcut appears to "stop working" after the first press. Blurring first guarantees
 * a fresh focus event on every call. (Verified in real Chrome via the accessibility tree plus
 * focus-event capture: a repeat focus emitted no event; blur-then-focus emitted one every time.)
 *
 * @param el - The element to focus, or null/undefined to do nothing.
 */
export function forceFocus(el: HTMLElement | null | undefined): void {
  if (!el) return;
  if (document.activeElement === el) el.blur();
  el.focus();
}

/**
 * Whether the message heading for `id` currently holds DOM focus (its `message-<id>` element is the
 * active element). Lets the quick-nav handler distinguish a re-press onto the already-focused
 * message from a genuine focus move, so it can speak "already here" instead of a silent re-focus.
 *
 * @param id - The message id to check.
 * @returns True when that message's heading is the active element.
 */
export function isMessageFocused(id: string): boolean {
  return document.getElementById(`message-${id}`) === document.activeElement;
}

/**
 * Focus a message heading by id (the `message-<id>` element {@link MessageList} renders, each
 * carrying `tabindex="-1"` so it is programmatically focusable). Focus is the navigation mechanism:
 * moving it positions the screen reader on the message and lets the focus system announce the
 * heading. The navigation does NOT emit its own announcement, so nothing competes with the focus.
 *
 * The focus is FORCED ({@link forceFocus}, so a repeat press re-announces), DEFERRED by
 * {@link FOCUS_DELAY_MS} out of the keydown handler, and the element is re-queried at focus time so it
 * survives an intervening render.
 *
 * Emits a `focusOutcome` diagnostic at every branch:
 * - `skipped-empty-id` - id was blank/empty (the original-bug smoking gun; emitted synchronously).
 * - `element-not-found` - the `message-<id>` element was absent from the DOM at focus time.
 * - `focused` - {@link forceFocus} succeeded and `document.activeElement` confirms it.
 * - `focus-failed` - {@link forceFocus} ran but `document.activeElement` did not move to the element.
 *
 * @param id - The message id to focus, or undefined to do nothing.
 */
export function focusMessage(id: string | undefined): void {
  if (!id) {
    logDiag({ type: 'focusOutcome', domId: '(empty)', outcome: 'skipped-empty-id' });
    return;
  }
  setTimeout(() => {
    const el = document.getElementById(`message-${id}`);
    if (!el) {
      logDiag({ type: 'focusOutcome', domId: id, outcome: 'element-not-found' });
      return;
    }
    forceFocus(el);
    const outcome = document.activeElement === el ? 'focused' : 'focus-failed';
    logDiag({ type: 'focusOutcome', domId: id, outcome });
  }, FOCUS_DELAY_MS);
}
