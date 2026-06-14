/** The resolved display labels shown on message headings and spoken by quick-nav. */
export interface RoleLabels {
  /** Label for the user's own messages. */
  user: string;
  /** Label for assistant messages. */
  assistant: string;
}

/**
 * Resolve the configured display names into the labels used for message headings and quick-nav
 * reads, falling back to "You"/"Assistant" when a name is unset or blank (so a label is never
 * empty). Single source of truth for the fallback, shared by MessageList and the quick-nav
 * descriptor.
 *
 * @param userName - The configured user display name, or undefined before settings hydrate.
 * @param assistantName - The configured assistant display name, or undefined before hydration.
 * @returns The resolved {@link RoleLabels}.
 */
export function resolveDisplayLabels(
  userName: string | undefined,
  assistantName: string | undefined,
): RoleLabels {
  return {
    user: userName?.trim() || 'You',
    assistant: assistantName?.trim() || 'Assistant',
  };
}
