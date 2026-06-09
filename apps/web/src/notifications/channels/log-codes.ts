import type { ClientLogEvent } from '@anvika/shared/client-log';

import type { NotificationEvent } from '../events';

/**
 * Map each notification event type to its allow-listed client-log code, or `null` to skip
 * forwarding. `generationProgress` is skipped: it ticks every couple of seconds and would flood the
 * screen-reader-navigable log; its window is already bracketed by started/complete. Only the code
 * (a fixed enum) is ever forwarded - never an event payload - so no response or error text leaks.
 */
export const LOG_CODES: Record<NotificationEvent['type'], ClientLogEvent | null> = {
  messageSent: 'notify-message-sent',
  generationStarted: 'notify-generation-started',
  generationProgress: null,
  generationComplete: 'notify-generation-complete',
  generationStopped: 'notify-generation-stopped',
  // The thinking lifecycle is transient UI feedback (spoken only), bracketed by the generation
  // events; not a loggable milestone, so both are skipped (same precedent as `generationProgress`).
  thinkingStarted: null,
  thinkingComplete: null,
  error: 'notify-error',
  messageCopied: 'notify-message-copied',
  // Copy failures are minor UI feedback (spoken high-priority), not a loggable milestone: skip.
  messageCopyFailed: null,
  settingsSaved: 'notify-settings-saved',
  // A save failure is spoken high-priority via the announce layer (ADR 0015); the failure detail
  // lives non-live in the DOM. Not a loggable milestone here: skip forwarding.
  settingsSaveFailed: null,
  // Superseded by the richer keyboard diagnostic (quickNavResolved/quickNavKeypress); not logged
  // here to avoid a duplicate line. Speech is unchanged - quickNavRead still speaks.
  quickNavRead: null,
  // No-op feedback events are minor UI acknowledgements, not loggable milestones: skip forwarding.
  alreadyInComposer: null,
  nothingToStop: null,
  composerEmpty: null,
  noMessageForRole: null,
  quickNavEmpty: null,
  // Superseded by the richer quickNavResolved diagnostic (which carries alreadyFocused); not logged
  // here to avoid a duplicate line (same precedent as quickNavRead). Speech is unchanged.
  quickNavAlreadyFocused: null,
  // Superseded by the richer `sendKeyModeToggled` keyboard diagnostic: logging a notification code
  // here too would duplicate the line (same precedent as `quickNavRead: null`).
  sendKeyModeChanged: null,
  // The pre-hydration notice is a minor UI no-op, like the other no-op feedback events: skip.
  settingsNotReady: null,
  // Both settings load outcomes are superseded by the richer `settingsReloaded`/`settingsLoadDegraded`
  // diagnostics (emitted from the store); logging a notification code here would duplicate the line
  // (same precedent as `quickNavRead: null`). Speech is unchanged.
  settingsReloaded: null,
  settingsLoadDegraded: null,
  connectionTestStarted: 'notify-connection-test-started',
  connectionTestOk: 'notify-connection-test-ok',
  connectionTestOkNoListing: 'notify-connection-test-ok-no-listing',
  connectionTestFailed: 'notify-connection-test-failed',
  // A transient reassurance spoken while a slow test is in flight (like `generationProgress` and
  // the no-op feedback events): not a loggable milestone, so it is skipped from the log.
  connectionTestStillRunning: null,
  // Connection CRUD milestones: forward the CODE only - never the label - so even the content-safe
  // display name does not cross the log boundary needlessly (never-log-content discipline).
  connectionSaved: 'notify-connection-saved',
  // A partial-failure milestone: the public config saved but the secret PUT failed. Forward the CODE
  // only - never the label - so even the content-safe display name does not cross the log boundary.
  connectionSaveFailed: 'notify-connection-save-failed',
  connectionRemoved: 'notify-connection-removed',
  // The FX refresh lifecycle is logged server-side where the refresh runs (the startup gate and
  // the on-demand route already emit content-safe outcome logs). The web notification layer only
  // speaks it, so forwarding a duplicate client code here is skipped (same precedent as the settings
  // load outcomes superseded by a richer server-side diagnostic).
  fxRefreshStarted: null,
  fxRefreshOk: null,
  fxRefreshFailed: null,
  connectionEnabledChanged: 'notify-connection-enabled-changed',
  // The refresh lifecycle is logged server-side in the route; the discovery problem is covered by the
  // fail-soft server discovery log. Forwarding a client code (and its labels) would duplicate and
  // needlessly cross the log boundary, so all four are skipped (same precedent as the FX events).
  modelsRefreshStarted: null,
  modelsRefreshOk: null,
  modelsRefreshFailed: null,
  modelDiscoveryProblem: null,
  // Reasoning toggle (Alt+T) and jump (Alt+R) no-op are transient UI feedback, not loggable
  // milestones -- same precedent as the other no-op feedback events above.
  reasoningEffortChanged: null,
  noThinkingToJumpTo: null,
  // Minor UI failure feedback spoken high-priority; not a loggable milestone (same precedent as
  // `settingsSaveFailed: null` -- the failure detail lives non-live in the DOM).
  reasoningOverrideSaveFailed: null,
  // A 409 optimistic-concurrency conflict: a recoverable problem worth a content-safe diagnostic
  // (code only, never an id/title). The registry logs this code at `warning`.
  conversationChangedElsewhere: 'notify-conversation-changed-elsewhere',
  // A live cross-tab transcript sync: a content-safe info milestone (code only, never an id,
  // title, or message text). Mirrors conversationChangedElsewhere's precedent.
  conversationUpdatedElsewhere: 'notify-conversation-updated-elsewhere',
  // A conversation was created: a content-safe info milestone (code only, never the id or title).
  conversationCreated: 'notify-conversation-created',
  // A conversation was renamed: a content-safe info milestone (code only, never the id or new title).
  conversationRenamed: 'notify-conversation-renamed',
  // A rename failed: a content-safe recoverable-failure milestone (code only). The registry logs this
  // code at `warning`.
  conversationRenameFailed: 'notify-conversation-rename-failed',
  // A conversation was deleted: a content-safe info milestone (code only, never the id or title).
  conversationDeleted: 'notify-conversation-deleted',
  // A single delete failed: a content-safe recoverable-failure milestone (code only, logged `warning`).
  conversationDeleteFailed: 'notify-conversation-delete-failed',
  // A batch of conversations was deleted: a content-safe info milestone (code only - the numeric count
  // never crosses the log boundary, matching the other code-only conversation milestones).
  conversationsBatchDeleted: 'notify-conversations-batch-deleted',
  // A batch delete failed: a content-safe recoverable-failure milestone (code only, logged `warning`).
  conversationsBatchDeleteFailed: 'notify-conversations-batch-delete-failed',
  // A conversation was pinned or unpinned: a content-safe info milestone (code only, never the id or title).
  conversationPinned: 'notify-conversation-pinned',
  conversationUnpinned: 'notify-conversation-unpinned',
  // A pin toggle failed: a content-safe recoverable-failure milestone (code only, logged `warning`).
  conversationPinFailed: 'notify-conversation-pin-failed',
  // A conversation was branched: a content-safe info milestone (code only, never the source/new id or title).
  conversationBranched: 'notify-conversation-branched',
  // A branch failed: a content-safe recoverable-failure milestone (code only, logged `warning`).
  conversationBranchFailed: 'notify-conversation-branch-failed',
  // A per-conversation model change (header picker) is transient UI feedback spoken only, not a
  // loggable milestone -- same precedent as `reasoningEffortChanged: null` (the sibling per-conversation
  // setting change). Skipping it also keeps the model label off the log boundary entirely.
  conversationModelChanged: null,
  // Minor UI failure feedback spoken high-priority; not a loggable milestone (same precedent as
  // `reasoningOverrideSaveFailed: null` -- the failure detail lives non-live in the DOM).
  modelOverrideSaveFailed: null,
  // A quick-nav conversation switch: a content-safe info milestone (code only - never the slot, id, or
  // title). The empty-slot no-op below is speech-only, matching `quickNavEmpty`.
  conversationSwitched: 'notify-conversation-switched',
  conversationQuickNavEmpty: null,
  // A pinned quick-nav conversation switch: a content-safe info milestone (code only - never the
  // slot, id, or title). The three pinned no-ops below are speech-only, matching `conversationQuickNavEmpty`.
  pinnedConversationSwitched: 'notify-pinned-conversation-switched',
  pinnedQuickNavEmpty: null,
  noPinnedConversations: null,
  cannotPinEmptyConversation: null,
  // A pinned shortcut fired before the conversation list resolved: a speech-only transient no-op
  // guard, not a loggable milestone (mirrors cannotPinEmptyConversation: null).
  conversationListLoading: null,
  // A per-message regenerate was invoked: a content-safe info milestone (code only, never the message
  // id or any response text - the id is an AI SDK call argument, not a log payload).
  messageRegenerating: 'notify-message-regenerating',
  // A user message was edited and resent: a content-safe info milestone (code only, never the edited
  // text or message id - both are AI SDK `sendMessage` arguments, not a log payload).
  messageEdited: 'notify-message-edited',
  // The menu Edit item opened the editor for a message: a content-safe info milestone (code only,
  // never the message id or text).
  messageEditStarted: 'notify-message-edit-started',
  // Ctrl+Up opened the editor for the latest user message: a content-safe info milestone (code only,
  // never the message id or text).
  latestMessageEditStarted: 'notify-latest-message-edit-started',
  // The inline editor was cancelled: a content-safe info milestone (code only, never the message id or text).
  messageEditCancelled: 'notify-message-edit-cancelled',
  // Ctrl+Up was refused mid-stream: a content-safe info milestone (code only). An expected guard
  // notice, not a failure, so it stays at `info`.
  editUnavailableWhileGenerating: 'notify-edit-unavailable-while-generating',
  // A pre-flight SDK throw dropped a message action: a content-safe recoverable-failure milestone
  // (code only, never the SDK error or any id). The registry logs this code at `warning`.
  messageActionFailed: 'notify-message-action-failed',
};
