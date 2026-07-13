import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import { resolveSendBinding } from '../../lib/keyboard/keyboardHelpers';
import type { MessageEditConfig } from './messageEditConfig';

/** Props for {@link MessageEditor}. */
export interface MessageEditorProps extends MessageEditConfig {
  /** The current message text to prefill and edit. */
  initialText: string;
  /**
   * Submit the edited, non-empty text (already trimmed). Submitting empty/whitespace-only text is a
   * no-op, so the caller never sees a blank edit.
   *
   * @param text - The trimmed, non-empty edited text.
   */
  onSubmit: (text: string) => void;
  /** Cancel editing and restore. Bound to Escape and the Cancel button. */
  onCancel: () => void;
}

/**
 * A controlled inline editor for a user message: a labeled multiline textarea prefilled with the
 * message text, plus visible Save and Cancel buttons. Presentational - it owns no data hooks and
 * reports submit/cancel through callbacks.
 *
 * The send key honors the user's `sendKeyMode` setting via {@link resolveSendBinding}, and the
 * `useHotkeys` ref is attached to THIS textarea so the binding is ELEMENT-SCOPED: it fires only while
 * the editor textarea has focus and never reaches the Composer's own send hotkey (which is likewise
 * scoped to the Composer textarea). The textarea is focused on mount (deferred one frame so it wins
 * any focus-restore from the closing actions menu), and Escape cancels rather than stranding focus on
 * `<body>`. Save is disabled while the trimmed text is empty, so an empty submit is inert.
 *
 * The editor knows nothing about streaming: it always reports a non-empty submit through `onSubmit`.
 * Whether a submit is allowed (for example, refused mid-stream with a spoken notice) is the owning
 * list's decision, so a blocked submit speaks its reason rather than failing silently at a disabled
 * control.
 *
 * Content-safe: the message text is never logged or announced.
 *
 * @param props - See {@link MessageEditorProps}.
 * @returns The inline message edit form.
 */
export function MessageEditor({
  initialText,
  sendKeyMode,
  sendBinding,
  onSubmit,
  onCancel,
}: MessageEditorProps) {
  const [text, setText] = useState(initialText);
  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0;

  // The single submit chokepoint: inert when the trimmed text is empty, so no path - button, form, or
  // hotkey - reports a blank edit.
  const submit = useCallback(() => {
    if (trimmed.length > 0) onSubmit(trimmed);
  }, [trimmed, onSubmit]);

  // The editor owns its send binding and fires only while ITS OWN textarea has focus (the `useHotkeys`
  // ref is attached below). In `enter` mode plain Enter submits; in `modEnter` mode the keymap `send`
  // binding submits and plain Enter newlines. `enableOnFormTags: ['TEXTAREA']` keeps it firing while
  // typing. Element-scoping means it never triggers the Composer's send hotkey.
  const binding = resolveSendBinding(sendKeyMode, sendBinding);
  const hotkeyRef = useHotkeys<HTMLTextAreaElement>(
    binding,
    () => submit(),
    {
      enableOnFormTags: ['TEXTAREA'],
      preventDefault: true,
      scopes: ['chat'],
    },
    [binding, submit],
  );

  // Merge the element-scoping hotkey ref with a local ref so the focus effect can reach the node.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      hotkeyRef(node);
      textareaRef.current = node;
    },
    [hotkeyRef],
  );

  // Focus on mount, deferred one frame so it lands AFTER the actions menu restores focus to its
  // trigger as it closes (the repo's RenameConversationField pattern), so the keyboard reliably ends
  // in the editor. The frame is cancelled on unmount so a fast cancel never focuses a detached node.
  useEffect(() => {
    const handle = requestAnimationFrame(() => textareaRef.current?.focus());
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Escape abandons inline rather than letting the keystroke bubble to an ancestor handler or strand
    // focus on `<body>`; the caller's onCancel restores focus to the message.
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1 px-2 py-2">
      <textarea
        ref={setTextareaRef}
        aria-label="Edit message"
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="min-w-0 flex-1 rounded border px-1 py-0.5"
      />
      <div className="flex items-center gap-1">
        <button type="submit" disabled={!canSubmit}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
