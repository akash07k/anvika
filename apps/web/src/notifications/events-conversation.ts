/**
 * Conversation-list and conversation-navigation lifecycle notification events: create, rename,
 * delete (single + batch), pin/unpin, branch, quick-nav switching (recent + pinned), and the
 * associated no-op guard notices. Extracted from {@link ./events} to keep that module under the
 * ADR 0007 line cap; composed back into `NotificationEvent` there via this union.
 *
 * Every variant here is payload-or-slot only (an id, title, or message text NEVER crosses the
 * notification layer); the per-variant comments record the content-safety rationale.
 */
export type ConversationNotificationEvent =
  // A chat send was rejected (409) because the conversation advanced elsewhere (optimistic-concurrency
  // conflict). Carries NOTHING - no id, title, or message - so it is content-safe. Announced assertively
  // so the user knows their message was not sent and can resend; the stale caches are refreshed.
  | { type: 'conversationChangedElsewhere' }
  // The transcript of the active conversation was updated in another tab (live cross-tab sync).
  // Carries NOTHING - no id, title, or message text - so it is content-safe. Announced at normal
  // priority (informational; no action required from the user). Payload-less by design.
  | { type: 'conversationUpdatedElsewhere' }
  // A fresh conversation draft was created (New conversation button or Alt+N). Payload-less - no id or
  // title crosses the notification layer - so it is content-safe.
  | { type: 'conversationCreated' }
  // A conversation was renamed (inline rename, 5a.2). Payload-less - the new title NEVER crosses the
  // notification layer - so it is content-safe. Announced high-priority to survive the focus churn of
  // the context menu and inline field closing.
  | { type: 'conversationRenamed' }
  // An inline rename failed (the PATCH rejected); the optimistic title was rolled back. Payload-less -
  // no id, title, or server error crosses the notification layer - so it is content-safe. Announced
  // high-priority so the screen-reader user learns the rename did not stick (logged at `warning`).
  | { type: 'conversationRenameFailed' }
  // A conversation was deleted (5a.3). Payload-less - no id or title crosses the notification layer -
  // so it is content-safe. Announced high-priority to survive the dialog-close + focus-move churn.
  | { type: 'conversationDeleted' }
  // A single-conversation delete failed (the DELETE rejected); nothing was removed. Payload-less -
  // content-safe - and announced high-priority so the failure is not silent (logged at `warning`).
  | { type: 'conversationDeleteFailed' }
  // Several conversations were deleted in one batch from Settings (5a.4). Carries only the numeric
  // COUNT - never ids or titles - so it is content-safe. Announced high-priority to survive the
  // dialog-close + selection-clear churn (mirrors `conversationDeleted`).
  | { type: 'conversationsBatchDeleted'; count: number }
  // A batch delete failed (the request rejected); nothing was removed and the selection is kept so the
  // user can retry. Payload-less - content-safe - announced high-priority (logged at `warning`).
  | { type: 'conversationsBatchDeleteFailed' }
  // A conversation was pinned or unpinned (context menu). Payload-less - no id or title crosses the
  // notification layer - so it is content-safe. Announced high-priority to survive the context-menu
  // focus churn (mirrors `conversationRenamed`).
  | { type: 'conversationPinned' }
  | { type: 'conversationUnpinned' }
  // A pin toggle failed (the PUT rejected); the optimistic pin was rolled back. Payload-less - no id,
  // title, or server error crosses the notification layer - so it is content-safe. Announced
  // high-priority so the screen-reader user learns the change did not stick (logged at `warning`).
  | { type: 'conversationPinFailed' }
  // The user switched to the Nth-most-recent conversation via a quick-nav shortcut. Carries ONLY the
  // slot position (1-10, a number) - never an id, title, or message text - so it is content-safe.
  // Announced high-priority to survive the navigation focus churn.
  | { type: 'conversationSwitched'; slot: number }
  // A conversation quick-nav slot had no conversation (no-op feedback, mirrors `quickNavEmpty`).
  // Payload-less, content-safe.
  | { type: 'conversationQuickNavEmpty' }
  // The user switched to the Nth-most-recent PINNED conversation via Ctrl+Alt+1..0. Carries ONLY the
  // slot position (1-10, a number) - never an id, title, or message text - so it is content-safe.
  // Announced high-priority to survive the navigation focus churn (mirrors `conversationSwitched`).
  | { type: 'pinnedConversationSwitched'; slot: number }
  // A pinned quick-nav slot had no pinned conversation (no-op feedback, mirrors `conversationQuickNavEmpty`).
  // Payload-less, content-safe.
  | { type: 'pinnedQuickNavEmpty' }
  // Ctrl+Alt+C was pressed with nothing pinned (the Pinned section is hidden), so there is no first
  // pinned conversation to jump to. Payload-less no-op feedback - content-safe.
  | { type: 'noPinnedConversations' }
  // Ctrl+Alt+P was pressed on an unsaved draft, so there is no persisted conversation row to pin.
  // Payload-less guard notice - content-safe.
  | { type: 'cannotPinEmptyConversation' }
  // A pinned shortcut fired before the conversation list query resolved (e.g. a cold deep-link
  // straight to /c/<id>), so it cannot yet tell an empty/draft state from a not-loaded-yet one.
  // Payload-less - no id, title, or message text crosses the notification layer - so it is
  // content-safe. A transient no-op guard that defers the genuine empty/cannot-pin cues until the
  // list has actually loaded.
  | { type: 'conversationListLoading' }
  // A conversation was branched (context menu): a copy was forked into a new conversation. Payload-less
  // - neither the source nor the new id or title crosses the notification layer - so it is content-safe.
  // Announced high-priority to survive the context-menu + navigation focus churn (mirrors conversationPinned).
  | { type: 'conversationBranched' }
  // A branch failed (the POST rejected); no new conversation was created. Payload-less - no id, title, or
  // server error crosses the notification layer - so it is content-safe. Announced high-priority so the
  // screen-reader user learns the branch did not happen (logged at `warning`).
  | { type: 'conversationBranchFailed' }
  // The per-conversation model override was changed (header picker). Carries ONLY the model's display
  // LABEL (e.g. "Claude Sonnet (Anthropic)") - connection/model metadata, never a conversation id,
  // title, or message text - so it is content-safe. Announced at normal priority (an informational
  // confirmation; mirrors `reasoningEffortChanged`, which is also speech-only).
  | { type: 'conversationModelChanged'; model: string }
  // A model-override write failed (the PATCH rejected); the optimistic selection was rolled back.
  // Payload-less - no id, title, model, or server error crosses the notification layer - so it is
  // content-safe. Announced high-priority so the screen-reader user learns the change did not stick
  // (mirrors `reasoningOverrideSaveFailed`; speech-only, the detail lives non-live in the DOM).
  | { type: 'modelOverrideSaveFailed' };
