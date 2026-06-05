import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { consumeComposerFocus } from '../lib/conversation/composerFocusIntent';
import { forceFocus } from '../lib/message/messageFocus';
import { resolveSendBinding } from '../lib/keyboard/keyboardHelpers';
import { notify } from '../notifications/notifier';

/** Props for {@link Composer}. */
export interface ComposerProps {
  /** Whether the composer is disabled while a response is in flight. */
  disabled: boolean;
  /** Called with the trimmed message text when the user sends. */
  onSend: (text: string) => void;
  /**
   * Which key sends the message (tracks the settings schema). `modEnter` (default) sends on the
   * keymap `send` binding and lets plain Enter insert a newline; `enter` sends on plain Enter and
   * lets Shift+Enter insert a newline.
   */
  sendKeyMode: RedactedSettings['sendKeyMode'];
  /**
   * The react-hotkeys-hook binding string for the `send` action (e.g. `ctrl+enter, meta+enter`),
   * used only in `modEnter` mode; `enter` mode binds the literal `enter` key regardless.
   */
  sendBinding: string;
  /**
   * Optional ref to the underlying textarea, the conversation's stable focus home base. A parent
   * uses it to return focus here after a transient control (Stop, Retry) it owns unmounts, so focus
   * is never lost. Optional, so existing callers are unaffected.
   */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /**
   * The conversation this composer belongs to; used to consume a navigation focus-intent scoped to
   * that conversation on mount. Optional: a composer with no conversation (e.g. a pre-conversation
   * surface) simply never auto-focuses.
   */
  conversationId?: string;
}

/**
 * Accessible message composer: a labelled multiline input and a send button.
 *
 * The textarea stays ENABLED while a response is in flight (only `disabled` gates Send): the user
 * keeps drafting the next message and focus is never stolen mid-generation. There is no
 * message queueing - Send is simply disabled until the response settles.
 */
export function Composer({
  disabled,
  onSend,
  sendKeyMode,
  sendBinding,
  inputRef,
  conversationId,
}: ComposerProps) {
  const [text, setText] = useState('');

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) {
      notify({ type: 'composerEmpty' }); // speak, so an empty send is not silently inert
      return;
    }
    onSend(trimmed);
    setText('');
  }

  function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    submit();
  }

  // The composer owns its send binding and fires only while ITS OWN textarea has focus: the
  // `useHotkeys` ref is attached below, element-scoping the binding so a second chat textarea (the
  // inline message editor) never triggers a composer send. In `enter` mode plain Enter sends
  // (Shift+Enter does not match `enter`, so it falls through to the default newline); in `modEnter`
  // mode the keymap `send` binding sends (plain Enter does not match it, so it newlines).
  // `enableOnFormTags: ['TEXTAREA']` keeps this firing while typing in the textarea.
  const binding = resolveSendBinding(sendKeyMode, sendBinding);
  const hotkeyRef = useHotkeys<HTMLTextAreaElement>(
    binding,
    () => submit(),
    { enableOnFormTags: ['TEXTAREA'], preventDefault: true, scopes: ['chat'], enabled: !disabled },
    [binding, disabled, text],
  );

  // Local ref to the textarea, used by the mount focus-intent effect below.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Merge the `useHotkeys` element-scoping ref, the optional `inputRef` (focus-on-completion and
  // the jump-to-composer shortcut depend on it), and `textareaRef` so ALL are set on the textarea node.
  const setTextareaRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      hotkeyRef(node);
      textareaRef.current = node;
      if (inputRef) inputRef.current = node;
    },
    [hotkeyRef, inputRef],
  );

  // Consume a pending navigation focus-intent exactly once on mount for this specific conversation,
  // so a new or switched-to conversation lands focus in the composer the moment it appears (not on a
  // fixed timer that races the route's loading state). A plain reload sets no intent, so it never
  // steals focus here. A composer with no conversationId (pre-conversation surface) never consumes.
  useEffect(() => {
    if (conversationId !== undefined && consumeComposerFocus(conversationId)) {
      forceFocus(textareaRef.current);
    }
  }, [conversationId]);

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="composer" id="composer-label">
        Message
      </label>
      {/* `htmlFor` gives the native label association (click-to-focus); `aria-labelledby`
          sources the accessible name from the same label and is required because oxlint's
          jsx-a11y/control-has-associated-label does not trace the `htmlFor`/`id` link. */}
      <textarea
        id="composer"
        ref={setTextareaRef}
        aria-labelledby="composer-label"
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" disabled={disabled}>
        Send
      </button>
    </form>
  );
}
