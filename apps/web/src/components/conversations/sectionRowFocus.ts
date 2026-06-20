/**
 * The DOM id of the "Conversations" list heading, used as a focus fallback. When a row leaves a section
 * and no sibling remains to receive focus (unpinning the last pinned conversation, or deleting the last
 * row of a section), the row flow moves focus to this heading so a screen-reader or keyboard user lands
 * on the list heading rather than on `<body>`. The heading carries `tabIndex={-1}` so it can take
 * programmatic focus. It lives here (not in `ConversationList`) so rows can import it without a cycle.
 */
export const CONVERSATIONS_HEADING_ID = 'conversations-heading';

/**
 * The DOM-id prefix shared by every conversation row link in the accordion section `sectionId`. A row
 * link's id is `${sectionLinkPrefix(sectionId)}${conversationId}`, so this prefix selects exactly the
 * rows of one section (the trailing hyphen keeps `last30` and `last3m` from matching each other).
 *
 * @param sectionId - The section the rows belong to (e.g. `pinned`, `recent`, `last7`).
 * @returns The id prefix common to that section's row links.
 */
export function sectionLinkPrefix(sectionId: string): string {
  return `conversation-link-${sectionId}-`;
}

/**
 * The DOM id of the row to focus after the row `currentLinkId` LEAVES its section (by unpinning out of
 * the Pinned section, or by being deleted): the next sibling row link in the same section, or the
 * previous one when the leaving row was last. Returns `null` when it was the only row in the section, so
 * the caller can fall back to the list heading.
 *
 * Read from live DOM order (which mirrors the rendered section order), so call this BEFORE the row
 * unmounts, then move focus a frame later once the re-render has settled. Collapsed accordion sections
 * are unmounted by Radix, but a row can only be acted on while its section is expanded, so the section's
 * siblings are always present in the DOM at call time.
 *
 * The selector is scoped to anchors (`a[...]`): each row link is a `<a>`, while the menu items the row
 * also renders carry ids that EXTEND the link id (`${linkId}-menu-pin`) and so share the section prefix.
 * Without the `a` scope an open menu's items would be mistaken for sibling rows.
 *
 * @param sectionPrefix - The {@link sectionLinkPrefix} of the section the leaving row is in.
 * @param currentLinkId - The DOM id of the leaving row's link.
 * @returns The sibling row's DOM id, or `null` when the leaving row was the section's only row.
 */
export function nextSiblingRowId(sectionPrefix: string, currentLinkId: string): string | null {
  const links = Array.from(document.querySelectorAll<HTMLElement>(`a[id^="${sectionPrefix}"]`));
  const index = links.findIndex((link) => link.id === currentLinkId);
  if (index === -1) return null;
  return (links[index + 1] ?? links[index - 1])?.id ?? null;
}
