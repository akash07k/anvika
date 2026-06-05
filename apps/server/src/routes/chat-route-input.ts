import type { ChatContentSink } from '../chat/content-log';
import type { ResolvedChatModel } from '../chat/resolve-model';
import type {
  ActiveConversationStore,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
  SettingsStore,
} from '../persistence/ports';

/** Options for {@link import('./chat').createChatRoute}. */
export interface CreateChatRouteInput {
  /** Resolve the chat model from its id; defaults to the settings-driven registry resolver. Injectable for tests. */
  resolveModel?: (modelId: string) => ResolvedChatModel | Promise<ResolvedChatModel>;
  /**
   * The settings store used to build the default resolver when `resolveModel` is not injected. The
   * caller injects EITHER `resolveModel` (tests) OR `settingsStore` (production via `app.ts`); the
   * field is optional because exactly one of the two is supplied.
   */
  settingsStore?: SettingsStore | undefined;
  /** Whether to log message content (default false). */
  logContent?: boolean | undefined;
  /** Where to emit content; defaults to the LogTape chat logger. Injectable for tests. */
  contentSink?: ChatContentSink | undefined;
  /**
   * The id-keyed multi-conversation store. When present AND the request carries a `conversationId`,
   * the finished turn persists via `saveTurn` under optimistic concurrency, and a stale
   * `baseRevision` 409s before the model resolves or any stream starts. Absent (or with no
   * `conversationId`) the turn stays ephemeral.
   */
  multiConversationStore?: MultiConversationStore | undefined;
  /**
   * The id-keyed per-conversation reasoning-override port. When present AND the request carries a
   * `conversationId`, the override is read by `(owner, conversationId)` and fed into the effort
   * cascade; absent either, the cascade falls through to the connection/global effort.
   */
  idReasoningOverrideStore?: IdReasoningOverrideStore | undefined;
  /**
   * The id-keyed per-conversation model-override port. When present AND the request carries a
   * `conversationId`, the stored override authoritatively selects the turn's model (the DB is the
   * source of truth, mirroring the reasoning override); absent either, the model falls back to the
   * request-body `modelId` and then the settings default.
   */
  idModelOverrideStore?: IdModelOverrideStore | undefined;
  /**
   * The active-conversation pointer store. When present AND a turn persists for a `conversationId`,
   * that conversation is marked active so a reload or restart restores it. In production this is the
   * same composed store as `multiConversationStore`; absent, the active pointer is left untouched.
   */
  activeStore?: ActiveConversationStore | undefined;
}
