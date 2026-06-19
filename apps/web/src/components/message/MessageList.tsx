import { useCallback, useEffect, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import type { RoleLabels } from '../../lib/format/displayNames';
import { useKeymap } from '../../hooks/shortcuts/useKeymap';
import { useMidnightRefresh } from '../../hooks/settings/useMidnightRefresh';
import { messageDomId, type AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import {
  DEFAULT_TIMESTAMP_OPTIONS,
  type TimestampFormatOptions,
} from '../../lib/format/timestampOptions';
import { notify } from '../../notifications/notifier';
import { MessageRow } from './MessageRow';
import { focusMessageHeading } from './messageHeadingFocus';
import type { MessageActions } from '../../hooks/conversation/useMessageActions';
import type { MessageEditConfig } from './messageEditConfig';

/** Props for {@link MessageList}. */
export interface MessageListProps {
  /** The conversation messages from the chat hook. */
  messages: AnvikaUIMessage[];
  /** Whether a response is generating; marks the log busy for assistive technology. */
  busy?: boolean;
  /** Resolved display labels for the message headings and the assistant Copy label; defaults to You/Assistant. */
  displayNames?: RoleLabels;
  /** How absolute timestamps render (from settings); defaults to the earlier output. */
  timestampOptions?: TimestampFormatOptions;
  /** Per-message action callbacks; absent ones hide their menu item. */
  messageActions?: MessageActions | undefined;
  /** Send-key config for the inline editor; absent disables the inline Edit affordance. */
  editConfig?: MessageEditConfig | undefined;
  /** Fired with whether an inline message editor is currently open (for cross-tab sync guarding). */
  onEditingChange?: ((editing: boolean) => void) | undefined;
}

/**
 * Render the conversation as a semantic list. Each message has a focusable role heading (so
 * focus-on-completion and the quick-nav jumps can target it), its absolute send/receive time, and its
 * text. The list is marked `aria-busy` while a response generates.
 *
 * The list owns the inline-edit state: at most ONE row's editor is open at a time (`editingId`).
 * Choosing Edit on a user row opens that row's editor (replacing its body/copy/menu/usage); on both
 * submit and cancel the editor closes and focus returns to that message's heading (deferred one frame
 * via {@link focusMessageHeading}) so focus never falls to `<body>` when the editor unmounts. The
 * `editLatestUserMessage` chat hotkey (Ctrl+Up by default) opens the editor for the most recent user
 * message and moves focus into it; it is a no-op when there is no user message or no send-key context.
 *
 * Deliberately a plain list, NOT `role="log"`: a log is an implicit live region and would
 * read streamed tokens and each new message aloud, fighting the explicit announce model. All live
 * information comes from the announce utility, never from this container.
 *
 * @param props - See {@link MessageListProps}.
 * @returns The rendered message list.
 */
export function MessageList({
  messages,
  busy = false,
  displayNames,
  timestampOptions = DEFAULT_TIMESTAMP_OPTIONS,
  messageActions,
  editConfig,
  onEditingChange,
}: MessageListProps) {
  // Re-render at midnight so a "today" timestamp flips to its dated form once it is no longer today.
  useMidnightRefresh();
  const labels: RoleLabels = displayNames ?? { user: 'You', assistant: 'Assistant' };
  const now = Date.now();

  // At most one editor open at a time, keyed by the message id; the row renders its editor when set.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Notify the parent whenever the inline-edit open state changes (e.g. to guard cross-tab sync).
  useEffect(() => {
    onEditingChange?.(editingId !== null);
  }, [editingId, onEditingChange]);

  // Close the editor and return focus to the message heading on the next frame, so focus never lands
  // on `<body>` as the editor unmounts (the heading is `tabIndex={-1}`, programmatically focusable).
  const closeEditor = useCallback((domId: string) => {
    setEditingId(null);
    focusMessageHeading(domId);
  }, []);

  // Quick-edit the most recent user message: open its inline editor (which focuses itself on mount).
  // Gated on send-key context and the edit action so a surface without them never half-opens an editor;
  // a no-op (SILENT) when no user message exists, so focus is never stranded. While a response is
  // generating the edit is REFUSED with a spoken notice (opening it would clobber the live response -
  // the menu Edit/Save paths are likewise streaming-gated). Content-safe: no text is read here.
  const canEdit = editConfig !== undefined && messageActions?.edit !== undefined;
  const openLatestUserEdit = useCallback(() => {
    if (!canEdit) return;
    if (busy) {
      // Refuse mid-stream and say why; the spoken notice is content-safe and the editor never opens.
      notify({ type: 'editUnavailableWhileGenerating' });
      return;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message?.role === 'user') {
        setEditingId(message.id);
        // Announce WHICH message is now being edited; the "Edit message" textbox label does not convey
        // "the last one". Content-safe: payload-less, no id or text crosses the notification layer.
        notify({ type: 'latestMessageEditStarted' });
        return;
      }
    }
  }, [canEdit, busy, messages]);

  const keymap = useKeymap();
  useHotkeys(
    keymap.editLatestUserMessage,
    openLatestUserEdit,
    { enableOnFormTags: ['TEXTAREA'], scopes: ['chat'], preventDefault: true },
    [keymap.editLatestUserMessage, openLatestUserEdit],
  );

  return (
    <ol aria-label="Messages" aria-busy={busy}>
      {messages.map((message, index) => {
        const domId = messageDomId(message, index);
        return (
          <MessageRow
            key={domId}
            message={message}
            index={index}
            domId={domId}
            isLast={index === messages.length - 1}
            busy={busy}
            labels={labels}
            now={now}
            timestampOptions={timestampOptions}
            messageActions={messageActions}
            editConfig={editConfig}
            isEditing={editingId === message.id}
            onEdit={() => {
              setEditingId(message.id);
              // The menu Edit item opened the editor: announce the editor is now open. Content-safe:
              // payload-less, no id or text crosses the notification layer.
              notify({ type: 'messageEditStarted' });
            }}
            onSubmitEdit={(text) => {
              // A blocked submit must SPEAK the reason (a disabled control would be silent for a
              // screen-reader user). While a turn streams, announce and keep the editor OPEN so the
              // user can wait or cancel.
              if (busy) {
                notify({ type: 'editUnavailableWhileGenerating' });
                return;
              }
              messageActions?.edit?.(message.id, text);
              closeEditor(domId);
            }}
            onCancelEdit={() => {
              // Announce the cancel BEFORE closing - only the cancel path fires this; submit announces
              // `messageEdited` via `messageActions.edit`, so the shared `closeEditor` stays silent.
              notify({ type: 'messageEditCancelled' });
              closeEditor(domId);
            }}
          />
        );
      })}
    </ol>
  );
}
