import { UNTITLED_CONVERSATION_LABEL } from './untitledLabel';

/** Props for {@link ConversationCheckbox}. */
export interface ConversationCheckboxProps {
  /** The conversation id this checkbox selects. */
  id: string;
  /** The conversation title; the checkbox's accessible name (content-safe in the UI, never logged). */
  title: string;
  /** Whether this conversation is currently selected. */
  checked: boolean;
  /** Toggle this conversation's selection. */
  onToggle: (id: string, checked: boolean) => void;
}

/**
 * One selectable conversation in the Settings batch-delete list: a native `<input type="checkbox">`
 * paired with a `<label>` whose text is the conversation title (falling back to "Untitled
 * conversation" for an empty title). A native checkbox is fully accessible to screen-reader and
 * keyboard users with no extra ARIA, so it is preferred over a custom primitive here. The title is
 * shown in the visible UI (content-safe) but never crosses the notification or log boundary.
 *
 * @param props - See {@link ConversationCheckboxProps}.
 * @returns The labeled checkbox row.
 */
export function ConversationCheckbox({ id, title, checked, onToggle }: ConversationCheckboxProps) {
  const label = title || UNTITLED_CONVERSATION_LABEL;
  return (
    <li>
      <label>
        <input
          type="checkbox"
          aria-label={label}
          checked={checked}
          onChange={(event) => onToggle(id, event.target.checked)}
        />
        {label}
      </label>
    </li>
  );
}
