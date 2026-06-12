import { useChat } from '@ai-sdk/react';
import { useRef, useState } from 'react';

import { ChatErrorRegion } from './ChatErrorRegion';
import { ChatReadinessNotice } from './ChatReadinessNotice';
import { ConversationSettings } from './ConversationSettings';
import { DeletedElsewhereNotice } from './DeletedElsewhereNotice';
import { Composer } from './Composer';
import { MessageList } from './message/MessageList';
import { WelcomePanel } from './WelcomePanel';
import { useAbortOnLeave } from '../hooks/chat/useAbortOnLeave';
import { useChatActions } from '../hooks/chat/useChatActions';
import { useChatConflict } from '../hooks/chat/useChatConflict';
import { useChatFinishHandler } from '../hooks/chat/useChatFinishHandler';
import { useChatHotkeys } from '../hooks/shortcuts/useChatHotkeys';
import { useChatScope } from '../hooks/chat/useChatScope';
import { useCrossTabSync } from '../hooks/crosstab/useCrossTabSync';
import { useHydrateSettings } from '../hooks/settings/useHydrateSettings';
import { useConversationModel } from '../hooks/conversation/useConversationModel';
import { useConversationReasoning } from '../hooks/conversation/useConversationReasoning';
import { useFocusOnCompletion } from '../hooks/focus/useFocusOnCompletion';
import { useGenerationHeartbeat } from '../hooks/chat/useGenerationHeartbeat';
import { useJumpToThinking } from '../hooks/shortcuts/useJumpToThinking';
import { useConversationMessageActions } from '../hooks/conversation/useConversationMessageActions';
import { useKeymap } from '../hooks/shortcuts/useKeymap';
import { useReadinessLog } from '../hooks/chat/useReadinessLog';
import { useSendKeyModeToggle } from '../hooks/shortcuts/useSendKeyModeToggle';
import { NEW_CONVERSATION_TITLE } from '@anvika/shared/conversation/title';

import { type AnvikaUIMessage } from '../lib/message/anvikaMessage';
import { useBaseRevision } from '../lib/conversation/conversationQueries';
import { resolveDisplayLabels } from '../lib/format/displayNames';
import { generationPhaseOf } from '../lib/message/generationPhase';
import { getQuickNavSettings } from '../lib/keyboard/quickNavSettings';
import { deriveTimestampOptions } from '../lib/format/timestampOptions';
import { useChatReadiness } from '../hooks/chat/useChatReadiness';
import { useChatTransport } from '../hooks/chat/chatTransport';
import { useDraftStore } from '../stores/draftStore';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * The conversation surface: streamed chat wired to the notification layer.
 *
 * - Heartbeat runs off chat status; `onFinish` emits the terminal generation event. Stop while
 *   generating; Retry on error. Focus-on-completion `move` focuses the latest response heading; it
 *   does NOT read the body (`readWholeOnComplete` is independent).
 * - Error handling is single-sourced via `useChatConflict`: the generic path announces
 *   once and focuses Retry; a 409 conflict refreshes the caches and announces assertively without
 *   stealing focus. The visual error is focusable and non-live (NOT `role="alert"`).
 * - Owns the `chat` hotkey scope while mounted; inert on other routes. Wires Stop, jumps,
 *   and quick-nav via `useChatHotkeys`. Stamps each outgoing message with `createdAt`. When set,
 *   `conversationId` becomes the `useChat` id and threads (with `baseRevision`) into each send; the
 *   post-finish list refresh advances the revision so the next send is not stale.
 */
export function ConversationView({
  initialMessages = [],
  conversationId,
  title,
}: {
  initialMessages?: AnvikaUIMessage[];
  conversationId?: string;
  /** The persisted conversation title; absent/null for a draft shows "New conversation". */
  title?: string | null;
}) {
  const settings = useSettingsStore((s) => s.settings);
  useHydrateSettings();

  const periodMs = settings?.announcementPeriodMs ?? 2000;
  const readWhole = settings?.readWholeOnComplete ?? false;
  const focusMode = settings?.focusOnCompletion ?? 'keep';
  const displayNames = resolveDisplayLabels(settings?.userName, settings?.assistantName);
  const timestampOptions = deriveTimestampOptions(settings ?? undefined);
  const keymap = useKeymap();

  useChatScope();

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const retryRef = useRef<HTMLButtonElement | null>(null);
  const settingsLinkRef = useRef<HTMLAnchorElement | null>(null);
  const pendingFocusOnComplete = useRef(false);
  const announcedError = useRef<string | null>(null);
  const requestIdRef = useRef(''); // per-instance in-flight turn correlation id
  const onTurnFinishedRef = useRef<() => void>(() => undefined); // lets onFinish reach the conflict refresh
  const reasoning = useConversationReasoning(conversationId, settings ?? null);
  const model = useConversationModel(conversationId);
  // The conversation's effective model: its per-conversation override, else the settings default.
  // Drives readiness (a pinned-but-now-unconfigured model shows the recoverable model-unavailable
  // notice). The transport sends only the override (omitting it when inheriting the live default).
  const effectiveModelId = model.modelId ?? settings?.selectedModelId ?? '';
  // The heading prefers a REAL persisted server title; for the active draft it falls back to the
  // title the advanced dialog chose (held in the draft store) so it appears immediately and is NOT
  // masked by the placeholder title the create-if-absent row carries before the rename lands - yet a
  // later real rename still wins over the stale draft title. A reload clears the draft store.
  const draftId = useDraftStore((s) => s.draftId);
  const draftTitle = useDraftStore((s) => s.draftTitle);
  const serverTitleReal = title && title !== NEW_CONVERSATION_TITLE ? title : null;
  const displayTitle =
    serverTitleReal ||
    (draftId === conversationId ? draftTitle : null) ||
    title ||
    NEW_CONVERSATION_TITLE;
  const readiness = useChatReadiness(effectiveModelId);
  useReadinessLog(readiness);
  const baseRevision = useBaseRevision(conversationId);
  const transport = useChatTransport(conversationId, baseRevision, model.modelId);
  const onFinish = useChatFinishHandler({
    readWhole,
    focusMode,
    pendingFocusOnComplete,
    onTurnFinished: () => onTurnFinishedRef.current(),
  });
  const { messages, setMessages, sendMessage, status, error, stop, regenerate } =
    useChat<AnvikaUIMessage>({
      transport,
      ...(conversationId ? { id: conversationId } : {}),
      messages: initialMessages,
      onFinish,
    });

  const busy = status === 'submitted' || status === 'streaming';
  const [isEditing, setIsEditing] = useState(false);
  const { deletedElsewhere } = useCrossTabSync({
    conversationId,
    isBusy: busy,
    isEditing,
    messages,
    setMessages,
  });
  const phase = generationPhaseOf(busy ? messages.at(-1) : undefined);
  useGenerationHeartbeat(busy, periodMs, phase);
  useAbortOnLeave({ isBusy: busy, stop }); // leaving while a turn is in flight aborts so the partial turn persists

  // Single-source error handling: 409 conflict announces assertively; all others take the generic path.
  const conflict = useChatConflict({
    error,
    conversationId,
    requestIdRef,
    announcedError,
    retryRef,
    settingsLinkRef,
    reasoningBeforeSend: reasoning.beforeSend,
    modelBeforeSend: model.beforeSend,
  });
  onTurnFinishedRef.current = conflict.onTurnFinished;

  useFocusOnCompletion(messages, pendingFocusOnComplete); // focus latest response heading on complete
  const onJumpToThinking = useJumpToThinking(messages);

  const { handleSend, handleStop, handleRetry, regenerateMessage, editMessage } = useChatActions({
    busy,
    sendMessage,
    stop,
    regenerate,
    composerRef,
    requestIdRef,
    beforeSend: conflict.beforeSend,
  });
  const { messageActions, editConfig } = useConversationMessageActions({
    conversationId,
    baseRevision,
    regenerateMessage,
    editMessage,
    sendKeyMode: settings?.sendKeyMode ?? 'modEnter',
    sendBinding: keymap.send,
  });

  // Chat shortcuts (Stop, jumps, quick-nav), firing even with the composer focused.
  const onToggleSendKeyMode = useSendKeyModeToggle();
  const quickNav = getQuickNavSettings(settings);
  useChatHotkeys({
    keymap,
    messages,
    onStop: handleStop,
    onToggleSendKeyMode,
    onToggleThinking: reasoning.onToggleThinking,
    onJumpToThinking,
    composerRef,
    ...quickNav,
    displayNames,
    timestampOptions,
  });

  if (deletedElsewhere) return <DeletedElsewhereNotice />; // unmounts Composer, discarding unsent text - accepted: the conversation is gone
  if (readiness === 'unconfigured') return <WelcomePanel />;

  return (
    <>
      <h1>{displayTitle}</h1>
      <MessageList
        messages={messages}
        busy={busy}
        displayNames={displayNames}
        timestampOptions={timestampOptions}
        messageActions={messageActions}
        editConfig={editConfig}
        onEditingChange={setIsEditing}
      />
      <ChatReadinessNotice readiness={readiness} />
      <ChatErrorRegion
        error={error}
        settingsLinkRef={settingsLinkRef}
        retryRef={retryRef}
        onRetry={handleRetry}
        requestId={requestIdRef.current}
      />
      {busy ? (
        <button type="button" onClick={handleStop}>
          Stop generating
        </button>
      ) : null}
      <ConversationSettings model={model} reasoning={reasoning} />
      <Composer
        {...(conversationId !== undefined ? { conversationId } : {})}
        disabled={busy || readiness !== 'ready'}
        onSend={handleSend}
        sendKeyMode={settings?.sendKeyMode ?? 'modEnter'}
        sendBinding={keymap.send}
        inputRef={composerRef}
      />
    </>
  );
}
