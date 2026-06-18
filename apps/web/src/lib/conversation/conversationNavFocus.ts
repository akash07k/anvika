import {
  CONVERSATIONS_HEADING_ID,
  sectionLinkPrefix,
} from '../../components/conversations/sectionRowFocus';
import { forceFocus } from '../message/messageFocus';

/**
 * Keyboard focus entry points for the conversation-list nav: move focus into the full list, or into
 * the Pinned section, so a screen-reader or keyboard user lands directly on a conversation without
 * tabbing to it. Both use {@link forceFocus} so a repeat press re-emits a focus event (a screen
 * reader's reading caret returns even when system focus already sits on the target), matching the
 * message-navigation focus behavior.
 */

/** The conversation-list landmark, whose `aria-label` distinguishes it from the in-region heading. */
const CONVERSATION_NAV_SELECTOR = 'nav[aria-label="Conversations List"]';

/** The DOM-id prefix of the Pinned section's row links (`conversation-link-pinned-`). */
const PINNED_ROW_PREFIX = sectionLinkPrefix('pinned');

/**
 * The Pinned section's accordion trigger button, selected via the section item's stable id. The id
 * sits on the `AccordionItem` (not the trigger) so Radix's trigger-id-derived `aria-labelledby` on the
 * content region is preserved; the focusable target is the trigger button inside it, which Radix keeps
 * mounted even when the section is collapsed.
 */
const PINNED_TRIGGER_SELECTOR = '#section-item-pinned [data-slot="accordion-trigger"]';

/**
 * Move focus into the conversation list (bound to the `focusConversationList` shortcut), so a
 * screen-reader or keyboard user lands directly on the list without tabbing to it. Focus targets, in
 * order: the active conversation row (its link carries `aria-current="page"`), else the first row link
 * (`id^="conversation-link-"`) in the landmark, else the "Conversations" list heading. The heading
 * always exists (the landmark renders it even while the list is empty or loading), so this never
 * leaves focus stranded.
 */
export function focusActiveConversationRow(): void {
  const nav = document.querySelector(CONVERSATION_NAV_SELECTOR);
  const active = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
  const firstRow = nav?.querySelector<HTMLElement>('a[id^="conversation-link-"]');
  const heading = document.getElementById(CONVERSATIONS_HEADING_ID);
  forceFocus(active ?? firstRow ?? heading);
}

/**
 * Move focus into the Pinned conversation section (bound to the `focusPinnedConversationList`
 * shortcut), so a screen-reader or keyboard user lands directly on a pinned conversation without
 * tabbing to it. Focus targets, in order: the active pinned row (its link carries `aria-current="page"`
 * and the `conversation-link-pinned-` id prefix), else the first pinned row, else the Pinned section's
 * accordion trigger button (inside `#section-item-pinned`). The trigger fallback covers the
 * collapsed-section case: Radix unmounts a collapsed section's rows, but the trigger always exists, so
 * focus is never stranded.
 */
export function focusPinnedConversationRow(): void {
  const nav = document.querySelector(CONVERSATION_NAV_SELECTOR);
  // The row lookups are scoped to the nav landmark (rows are nav-local), but the trigger fallback
  // uses a global `document.querySelector`: `#section-item-pinned` is a globally unique id of ours,
  // and the trigger must resolve even when the collapsed section's rows are unmounted (so scoping it
  // to the nav would buy nothing and only risk missing it). Brittleness note: the trigger selector
  // leans on `[data-slot="accordion-trigger"]`, a Radix-internal attribute - acceptable here because
  // the `#section-item-pinned` id is ours and the row-based targets cover the common (expanded) case.
  const active = nav?.querySelector<HTMLElement>(
    `a[id^="${PINNED_ROW_PREFIX}"][aria-current="page"]`,
  );
  const firstRow = nav?.querySelector<HTMLElement>(`a[id^="${PINNED_ROW_PREFIX}"]`);
  const trigger = document.querySelector<HTMLElement>(PINNED_TRIGGER_SELECTOR);
  forceFocus(active ?? firstRow ?? trigger);
}
