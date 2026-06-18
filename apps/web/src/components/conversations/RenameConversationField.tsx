import { useEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from 'react';

/** Props for {@link RenameConversationField}. */
export interface RenameConversationFieldProps {
  /** The current title, used to prefill the input. */
  currentTitle: string;
  /**
   * Submit the new (trimmed-non-empty) title. The field guarantees `nextTitle` is non-empty after
   * trimming, so the caller never has to re-check the {@link RenameConversationSchema} min-length.
   *
   * @param nextTitle - The new title to persist.
   */
  onSubmit: (nextTitle: string) => void;
  /** Abandon the rename, restoring the original title. Bound to Escape and the Cancel button. */
  onCancel: () => void;
}

/**
 * The inline rename editor that replaces a conversation row's link while renaming (5a.2): a labeled
 * text input prefilled with the current title, plus visible Save and Cancel buttons. Enter (or Save)
 * submits; Escape (or Cancel) abandons. An empty/whitespace-only title is rejected before submit (the
 * shared {@link RenameConversationSchema} requires `min(1)` after trimming), so Save is disabled and
 * Enter is a no-op while the field is blank - the caller's mutation never sees an invalid title.
 *
 * The input is focused on mount (via an effect, not `autoFocus`) so the keyboard lands in it the
 * instant the row swaps to edit mode, and it is labeled `Rename conversation` so a screen reader
 * announces the purpose on focus-in. The focus is deferred one frame: when Rename is chosen from the
 * row's context menu, Radix restores focus to the trigger link as the menu closes, and that link is
 * unmounting as this field mounts - a `requestAnimationFrame` lands the field's focus AFTER Radix's
 * restore so the keyboard reliably ends up in the input rather than on `<body>`.
 *
 * @param props - See {@link RenameConversationFieldProps}.
 * @returns The inline rename form.
 */
export function RenameConversationField({
  currentTitle,
  onSubmit,
  onCancel,
}: RenameConversationFieldProps) {
  const [value, setValue] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  // Move focus into the field on mount, so the keyboard lands in it the instant the row enters edit
  // mode (the repo's focus-on-mount pattern, used instead of the flagged `autoFocus` attribute).
  // Deferred one frame so it wins the context menu's trigger-focus restore (see the component doc).
  useEffect(() => {
    const handle = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(handle);
  }, []);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (canSubmit) onSubmit(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Escape abandons inline rather than letting the keystroke bubble to any ancestor handler.
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1 px-2 py-2">
      <input
        ref={inputRef}
        type="text"
        aria-label="Rename conversation"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 rounded border px-1 py-0.5"
      />
      <button type="submit" disabled={!canSubmit}>
        Save
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
