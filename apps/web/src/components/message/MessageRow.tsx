import type { RoleLabels } from '../../lib/format/displayNames';
import { createdAtOf, type AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { textOf } from '../../lib/message/messageText';
import { formatTimestamp } from '../../lib/format/timeFormat';
import type { TimestampFormatOptions } from '../../lib/format/timestampOptions';
import { CopyButton } from './CopyButton';
import { MessageBody } from './MessageBody';
import { MessageReasoning } from './MessageReasoning';
import { MessageUsageDetails } from './MessageUsageDetails';
import { MessageActionsMenu } from './MessageActionsMenu';
import { MessageEditor } from './MessageEditor';
import type { MessageActions } from '../../hooks/conversation/useMessageActions';
import type { MessageEditConfig } from './messageEditConfig';

/** Props for {@link MessageRow}. */
export interface MessageRowProps {
  /** The message rendered in this row. */
  message: AnvikaUIMessage;
  /** The message's 0-based index, used for branch and the positional dom-id fallback. */
  index: number;
  /** The stable DOM/key handle for this message (from `messageDomId`). */
  domId: string;
  /** Whether this is the last row (only the last row reflects the live busy/streaming phase). */
  isLast: boolean;
  /** Whether a response is generating; disables menu items and marks the live row. */
  busy: boolean;
  /** Resolved role labels for the heading and the assistant Copy label. */
  labels: RoleLabels;
  /** The current time (ms) used to render this row's timestamp. */
  now: number;
  /** How absolute timestamps render. */
  timestampOptions: TimestampFormatOptions;
  /** Per-message action callbacks; absent ones hide their menu item. */
  messageActions?: MessageActions | undefined;
  /** Send-key configuration for the inline editor; absent disables inline edit. */
  editConfig?: MessageEditConfig | undefined;
  /** Whether THIS row's inline editor is open (one editor open at a time, owned by the list). */
  isEditing: boolean;
  /** Open this row's inline editor (sets the list's editing id). */
  onEdit: () => void;
  /** Submit the edited text: forwards to `messageActions.edit` and closes the editor. */
  onSubmitEdit: (text: string) => void;
  /** Cancel editing: closes the editor without resending. */
  onCancelEdit: () => void;
}

/**
 * Render one conversation message as a list row. The row always carries a focusable role heading and
 * its absolute timestamp. When NOT editing it shows the reasoning, body, Copy button, per-message
 * actions menu, and usage disclosure. When `isEditing` is true the body/copy/menu/usage are replaced
 * by the inline {@link MessageEditor} (the heading stays, so heading-by-heading nav is intact), so
 * exactly one editor is open at a time (the list owns the editing id).
 *
 * The Edit menu item is wired only for user rows that have both an `edit` action and an `editConfig`;
 * assistant rows pass `onEdit={undefined}` so the menu never offers Edit there. Content-safe: the
 * message text flows only into the editor and `onSubmitEdit`, never logged or announced here.
 *
 * @param props - See {@link MessageRowProps}.
 * @returns The rendered message row.
 */
export function MessageRow({
  message,
  index,
  domId,
  isLast,
  busy,
  labels,
  now,
  timestampOptions,
  messageActions,
  editConfig,
  isEditing,
  onEdit,
  onSubmitEdit,
  onCancelEdit,
}: MessageRowProps) {
  const at = createdAtOf(message);
  const isUser = message.role === 'user';
  const canEdit = isUser && editConfig !== undefined && messageActions?.edit !== undefined;
  return (
    <li>
      <h2 id={`message-${domId}`} tabIndex={-1}>
        {isUser ? labels.user : labels.assistant}
      </h2>
      {at !== undefined ? <p>{formatTimestamp(at, now, timestampOptions)}</p> : null}
      {isEditing && editConfig !== undefined ? (
        <MessageEditor
          initialText={textOf(message)}
          sendKeyMode={editConfig.sendKeyMode}
          sendBinding={editConfig.sendBinding}
          onSubmit={onSubmitEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <>
          <MessageReasoning message={message} busy={busy && isLast} domId={domId} />
          <MessageBody message={message} busy={busy && isLast} />
          <CopyButton
            text={textOf(message)}
            label={isUser ? 'Copy your message' : `Copy ${labels.assistant}'s message`}
          />
          <MessageActionsMenu
            idBase={domId}
            triggerLabel={
              isUser ? 'Actions for your message' : `Actions for ${labels.assistant}'s message`
            }
            messageRole={isUser ? 'user' : 'assistant'}
            isStreaming={busy}
            onBranch={
              // `index` MUST be the transcript index - the position in the `useChat` messages array
              // the server prefix-copy expects - never a filtered or reordered render index, or a
              // future filtered render would silently branch from the wrong point.
              messageActions?.branchFromHere
                ? () => messageActions.branchFromHere?.(index)
                : undefined
            }
            onEdit={canEdit ? onEdit : undefined}
            onRegenerate={
              messageActions?.regenerate ? () => messageActions.regenerate?.(message.id) : undefined
            }
          />
          <MessageUsageDetails message={message} />
        </>
      )}
    </li>
  );
}
