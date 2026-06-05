import { type RefObject, useCallback } from 'react';

import type { UseChatHelpers } from '@ai-sdk/react';

import { reportClientError } from '../../diagnostics/reportClientError';
import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { beginTurn } from '../../lib/api/requestId';
import { notify } from '../../notifications/notifier';

/** What {@link useChatActions} needs from the chat surface to drive send/stop/retry. */
export interface ChatActionsOptions {
  /** Whether a generation is in flight (Stop is only meaningful then). */
  busy: boolean;
  /** Send a chat message (from `useChat`). */
  sendMessage: UseChatHelpers<AnvikaUIMessage>['sendMessage'];
  /** Stop the in-flight generation (from `useChat`). */
  stop: UseChatHelpers<AnvikaUIMessage>['stop'];
  /** Regenerate the last response (from `useChat`). */
  regenerate: UseChatHelpers<AnvikaUIMessage>['regenerate'];
  /** Ref to the composer textarea, the focus-return target after a transient control vanishes. */
  composerRef: RefObject<HTMLTextAreaElement | null>;
  /** Holds the in-flight turn correlation id (passed to `beginTurn`). */
  requestIdRef: { current: string };
  /**
   * Awaited before EVERY generation-starting action (send, retry, per-message regenerate, edit) via the
   * shared `afterSendGate`, so an in-flight per-conversation override write (and the list load) lands
   * first - no toggle-then-act race. Defaults to a resolved promise; returns a promise that resolves
   * when the action may proceed.
   */
  beforeSend?: () => Promise<void>;
}

/** The chat action handlers (send, stop, retry, per-message regenerate, edit). */
export interface ChatActions {
  /** Send a message: stamp `createdAt` and a fresh turn id, then forward to `sendMessage`. */
  handleSend: (text: string) => void;
  /** Stop the in-flight generation, or speak a no-op notice when nothing is generating. */
  handleStop: () => void;
  /** Regenerate the last response and return focus to the composer. */
  handleRetry: () => void;
  /**
   * Regenerate a specific assistant message by id (the per-message Regenerate action), with a fresh
   * turn id, and announce the regenerate. Unlike {@link handleRetry} (the last-assistant case) this
   * does NOT move focus: the action fires from a context menu, so focus stays where the user is.
   */
  regenerateMessage: (messageId: string) => void;
  /**
   * Edit a user message by id and resend (truncate-and-resend): replace the message at `messageId`
   * with `text` via `sendMessage`, so the AI SDK truncates everything after it and regenerates. Stamps
   * the same `createdAt` metadata and fresh turn headers a normal send uses, then announces the edit.
   * Content-safe: the text and id flow ONLY into `sendMessage`, never into the notification/log path.
   */
  editMessage: (messageId: string, text: string) => void;
}

/**
 * Build the chat send/stop/retry handlers. Extracted from `ConversationView` to keep that surface
 * under the 200-line cap (ADR 0007), matching the file's existing extractions (`ChatErrorRegion`,
 * `useReadinessLog`). A genuine hook: each handler is memoized with `useCallback` so its identity is
 * stable across renders, which keeps the Stop hotkey (whose `useHotkeys` depends on `onStop`) from
 * re-registering on every render, e.g. each heartbeat tick while generating. Behavior matches the
 * former inline handlers: send stamps `createdAt` and a fresh turn id; stop speaks a no-op notice
 * when nothing is generating and returns focus to the composer; retry regenerates the last response
 * and returns focus to the composer; per-message regenerate targets a specific assistant
 * message by id, announces, and leaves focus in place (it fires from a context menu); edit replaces a
 * user message by id and resends (truncate-and-resend) with the same `createdAt` stamp and turn
 * headers as a normal send, then announces.
 *
 * ALL four generation-starting actions (send, retry, per-message regenerate, edit) honor the same
 * send gate via {@link afterSendGate}: each awaits `beforeSend` so any in-flight per-conversation
 * override write (and the list load) settles before the turn begins - a toggle-then-act race never
 * generates with stale settings. The user-facing notify fires immediately (before the gate) for
 * instant feedback, while `beginTurn` is stamped inside the gate so the turn id reflects request
 * time. `handleStop` does not start a generation, so it bypasses the gate. Focus moves (retry) stay
 * synchronous; only the SDK call is deferred behind the gate.
 *
 * @param options - See {@link ChatActionsOptions}.
 * @returns The {@link ChatActions} handlers.
 */
export function useChatActions({
  busy,
  sendMessage,
  stop,
  regenerate,
  composerRef,
  requestIdRef,
  beforeSend,
}: ChatActionsOptions): ChatActions {
  // Run a generation-starting action behind the send gate: await any in-flight per-conversation
  // reasoning-override write (and the list load) so a toggle-then-act race never generates with stale
  // settings. Shared by every action that begins a turn so they honor one gate.
  const afterSendGate = useCallback(
    (run: () => Promise<void>) => {
      const proceed = beforeSend ? beforeSend() : Promise.resolve();
      void proceed.then(run).catch((err) => {
        // A pre-flight SDK validation throw (e.g. the target message was removed by a concurrent action
        // between render and activation) rejects synchronously and never reaches useChat's error state,
        // so surface it here rather than dropping it silently. Genuine network/server errors are caught
        // by the SDK and surfaced via useChatConflict, so they do not reach this catch.
        reportClientError(err, requestIdRef.current);
        notify({ type: 'messageActionFailed' });
      });
    },
    [beforeSend, requestIdRef],
  );

  const handleSend = useCallback(
    (text: string) => {
      notify({ type: 'messageSent' });
      afterSendGate(() =>
        sendMessage(
          { text, metadata: { createdAt: Date.now() } },
          { headers: beginTurn(requestIdRef) },
        ),
      );
    },
    [sendMessage, requestIdRef, afterSendGate],
  );

  const handleStop = useCallback(() => {
    if (!busy) {
      notify({ type: 'nothingToStop' }); // speak, so Stop with nothing generating is not silently inert
      return;
    }
    void stop();
    composerRef.current?.focus(); // never leave focus on the vanishing Stop button
  }, [busy, stop, composerRef]);

  const handleRetry = useCallback(() => {
    afterSendGate(() => regenerate({ headers: beginTurn(requestIdRef) }));
    composerRef.current?.focus(); // focus stays synchronous; only the regenerate is gated
  }, [regenerate, composerRef, requestIdRef, afterSendGate]);

  const regenerateMessage = useCallback(
    (messageId: string) => {
      notify({ type: 'messageRegenerating' });
      afterSendGate(() => regenerate({ messageId, headers: beginTurn(requestIdRef) }));
    },
    [regenerate, requestIdRef, afterSendGate],
  );

  const editMessage = useCallback(
    (messageId: string, text: string) => {
      notify({ type: 'messageEdited' });
      // Replace the user message at `messageId`; the AI SDK truncates everything after it and
      // regenerates. Same `createdAt` stamp + fresh turn headers as a normal send (see handleSend).
      afterSendGate(() =>
        sendMessage(
          { text, messageId, metadata: { createdAt: Date.now() } },
          { headers: beginTurn(requestIdRef) },
        ),
      );
    },
    [sendMessage, requestIdRef, afterSendGate],
  );

  return { handleSend, handleStop, handleRetry, regenerateMessage, editMessage };
}
