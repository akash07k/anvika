import type { ConversationNotificationEvent } from './events-conversation';

/** Priority of a screen-reader announcement; mirrors the ariaNotify priority. */
export type NotificationPriority = 'normal' | 'high';

/**
 * A semantic application event, raised by the UI through {@link notify} and rendered by each
 * registered channel in its own medium (speech today; audio cues later - ADR 0013). Adding a new
 * app event is a new variant here plus a case in each channel.
 */
export type NotificationEvent =
  | { type: 'messageSent' }
  | { type: 'generationStarted' }
  | { type: 'generationProgress'; seconds: number; thinking?: boolean }
  | { type: 'generationComplete'; text: string; readWhole: boolean }
  | { type: 'generationStopped' }
  // The reasoning ("thinking") lifecycle. `thinkingStarted` fires when the model begins thinking;
  // `thinkingComplete` fires at the transition to answer text, carrying the whole elapsed thinking
  // seconds (an integer, never reasoning text). Metadata-only, so content-safe.
  | { type: 'thinkingStarted' }
  | { type: 'thinkingComplete'; seconds: number }
  | { type: 'error'; message: string }
  | { type: 'messageCopied' }
  | { type: 'messageCopyFailed' }
  | { type: 'settingsSaved' }
  | { type: 'settingsSaveFailed'; message: string }
  | { type: 'quickNavRead'; text: string }
  // No-op feedback: an action the user invoked had nothing to do, so it speaks instead of being
  // silently inert (a screen-reader user gets no other signal that the key registered).
  | { type: 'alreadyInComposer' }
  | { type: 'nothingToStop' }
  | { type: 'composerEmpty' }
  | { type: 'noMessageForRole'; role: 'user' | 'assistant' }
  | { type: 'quickNavEmpty' }
  // No-op feedback: a quick-nav double press re-targeted the message that already has focus, so it
  // speaks "already here" instead of a silent re-focus.
  | { type: 'quickNavAlreadyFocused' }
  // The send-key-mode toggle (Alt+Enter): a success confirmation. It carries the platform so the
  // speech channel stays a pure mapping (it reads event.isMac rather than touching navigator).
  | { type: 'sendKeyModeChanged'; mode: 'enter' | 'modEnter'; isMac: boolean }
  // No-op: the toggle fired before settings hydrated, so nothing changed.
  | { type: 'settingsNotReady' }
  // Settings were reloaded from disk on user request (a success confirmation).
  | { type: 'settingsReloaded' }
  // The stored settings could not be read on load/reload, so defaults were substituted.
  | { type: 'settingsLoadDegraded' }
  // A connection test has begun (Test connection button). Label-agnostic: the user already has
  // focus on the connection's row, so the announcement needs no label - and carrying one would
  // risk leaking content. Content-safe.
  | { type: 'connectionTestStarted' }
  // The test is taking a while (past the still-running threshold) but is still in flight; a single
  // reassurance so a screen-reader user knows it has not silently stalled. Content-safe.
  | { type: 'connectionTestStillRunning' }
  // The test succeeded and the provider listed models; carries only the count (never a label or
  // base URL). Content-safe.
  | { type: 'connectionTestOk'; modelCount: number }
  // The test succeeded but the provider does not list models, so there is no count to announce.
  // Content-safe.
  | { type: 'connectionTestOkNoListing' }
  // The test failed; carries only a content-safe category (never the server's error message, the
  // base URL, or any header value). Content-safe.
  | { type: 'connectionTestFailed'; category: 'unauthorized' | 'unreachable' | 'error' }
  // A connection was added or edited and persisted. Carries only the connection label, which the
  // user authored as a display name (never a secret, header value, or base URL). Content-safe.
  | { type: 'connectionSaved'; label: string }
  // A connection's public config saved, but writing its secret (PUT secret) failed - a partial failure.
  // Carries only the content-safe label so the user knows which connection to re-edit. Content-safe.
  | { type: 'connectionSaveFailed'; label: string }
  // A connection was removed and persisted. Carries the connection label and whether the selected
  // model was cleared because it belonged to this connection. Content-safe.
  | { type: 'connectionRemoved'; label: string; modelCleared: boolean }
  // The FX rate refresh lifecycle. `fxRefreshOk` carries the new rate (a public number, spoken
  // to 3 decimals); the failure is uniform and carries nothing. Content-safe.
  | { type: 'fxRefreshStarted' }
  | { type: 'fxRefreshOk'; rate: number }
  | { type: 'fxRefreshFailed' }
  // A connection was muted or unmuted. Carries the content-safe label and the new state.
  | { type: 'connectionEnabledChanged'; label: string; enabled: boolean }
  // The manual models refresh lifecycle. `modelsRefreshOk` carries the available count and the
  // content-safe labels of any connection whose listing could not be loaded. Content-safe.
  | { type: 'modelsRefreshStarted' }
  | { type: 'modelsRefreshOk'; count: number; problemLabels: string[] }
  | { type: 'modelsRefreshFailed' }
  // A passive load surfaced new discovery problems; names the affected connections. Content-safe.
  | { type: 'modelDiscoveryProblem'; labels: string[] }
  // Alt+T flipped the per-conversation effort; carries only the resolved effort enum (metadata, never
  // reasoning text). Content-safe.
  | { type: 'reasoningEffortChanged'; effort: 'off' | 'low' | 'medium' | 'high' }
  // No-op: Alt+R found no thinking region on the latest message to jump to. Content-safe.
  | { type: 'noThinkingToJumpTo' }
  // The per-conversation override write (PATCH /api/v1/conversations/:id/reasoning) failed. Carries
  // nothing: the only feedback is the spoken notice; the control reconciles to the persisted state
  // on the next query refetch. Content-safe.
  | { type: 'reasoningOverrideSaveFailed' }
  // The conversation-list/nav lifecycle events (create, rename, delete, pin/unpin, branch, quick-nav
  // switching) live in their own module to keep this file under the ADR 0007 line cap; composed here.
  | ConversationNotificationEvent
  // A per-message regenerate was invoked (the assistant-row Regenerate action). Payload-less - no message
  // id or text crosses the notification layer (the id is an AI SDK call argument only) - so it is
  // content-safe. Announced high-priority to survive the context-menu focus churn (mirrors conversationBranched).
  | { type: 'messageRegenerating' }
  // A user message was edited and resent (truncate-and-resend). Payload-less - neither the edited text nor
  // the message id crosses the notification layer (both are AI SDK `sendMessage` arguments only) - so it is
  // content-safe. Announced high-priority to survive the editor-close focus churn (mirrors messageRegenerating).
  | { type: 'messageEdited' }
  // The menu "Edit" item opened the inline editor for a message (the general case). Payload-less - no
  // message id or text crosses the notification layer - so it is content-safe. Tells a screen-reader
  // user the editor is now open ("Editing message"). The Ctrl+Up last-message case is the distinct
  // `latestMessageEditStarted` event below.
  | { type: 'messageEditStarted' }
  // Ctrl+Up opened the inline editor for the most recent user message. Payload-less - no message id or
  // text crosses the notification layer - so it is content-safe. Tells a screen-reader user WHICH
  // message they are now editing ("Editing last message"); the "Edit message" textbox label does not
  // convey "the last one". Fired only from the Ctrl+Up path, never the menu Edit path.
  | { type: 'latestMessageEditStarted' }
  // The inline editor was cancelled (Escape or the Cancel button), so the edit was abandoned. Payload-less
  // - no message id or text crosses the notification layer - so it is content-safe. Fired ONLY from the
  // cancel path, never the submit path (submit announces `messageEdited`). Announced high-priority to
  // survive the editor-close focus churn (mirrors `messageEdited`).
  | { type: 'messageEditCancelled' }
  // Ctrl+Up was pressed while a response was generating, so the quick-edit guard refused to open the
  // editor (editing mid-stream would clobber the live response). Payload-less - content-safe - and
  // announced high-priority so a screen-reader user hears WHY nothing opened (logged at `info`: an
  // expected guard notice, not a failure).
  | { type: 'editUnavailableWhileGenerating' }
  // A generation-starting message action could not be completed because the AI SDK threw synchronously
  // pre-flight (e.g. the target message was removed by a concurrent action between render and
  // activation). Payload-less - no id, text, or SDK error crosses the notification layer - so it is
  // content-safe. Announced high-priority so the failure is not silent (logged at `warning`: a
  // recoverable failure).
  | { type: 'messageActionFailed' };
