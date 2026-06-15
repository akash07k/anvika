import type { UIMessage } from 'ai';
import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

/** A lightweight conversation list entry: enough to render the nav and read a fresh baseRevision. */
export type ConversationSummary = {
  /** The conversation id (short `xxx-xxx` form). */
  id: string;
  /** The display title (already failed soft on read; never the corrupt stored value). */
  title: string;
  /** Unix-epoch seconds of the last `saveTurn`, driving most-recent-first ordering. */
  updatedAt: number;
  /** Unix-epoch seconds the conversation was pinned, or `null` when unpinned. */
  pinnedAt: number | null;
  /** The optimistic-concurrency token, surfaced so the client holds a fresh `baseRevision`. */
  revision: number;
};

/** A conversation's full detail for the chat surface. */
export type ConversationDetail = {
  /** The full message transcript (returned verbatim; validated at the route boundary). */
  messages: UIMessage[];
  /** The display title (already failed soft on read). */
  title: string;
  /** The per-conversation reasoning-effort override, or `null` to inherit (failed soft on read). */
  reasoningOverride: ReasoningEffort | null;
  /** The per-conversation model id override, or `null` to inherit (failed soft on read). */
  modelId: string | null;
  /** The optimistic-concurrency token for the next `saveTurn`. */
  revision: number;
};

/** Outcome of a saveTurn: success carries the new revision; conflict carries the stored one. */
export type SaveResult =
  | { ok: true; revision: number }
  | { ok: false; conflict: true; currentRevision: number };

/**
 * Outcome of a branch: success carries the new conversation's summary; failure carries a reason.
 * Discriminated so only `conflict` (a stale `baseRevision`) carries the source's `currentRevision` for
 * re-basing; the other reasons are unconditional: `not-found` (source absent), `collision` (`newId`
 * already exists), and `bad-index` (a `throughIndex` past the source's last message).
 */
export type BranchResult =
  | { ok: true; summary: ConversationSummary }
  | { ok: false; reason: 'conflict'; currentRevision: number }
  | { ok: false; reason: 'not-found' | 'collision' | 'bad-index' };

/**
 * The id-keyed multi-conversation store. Every method is `(owner, id)`-scoped and never crosses
 * owners. `revision` and `updatedAt` advance only on {@link MultiConversationStore.saveTurn}.
 */
export interface MultiConversationStore {
  /**
   * List the owner's conversations as summaries, most-recently-updated first.
   *
   * @param owner - The conversation owner.
   * @returns The summaries (empty when the owner has none).
   */
  list(owner: string): Promise<ConversationSummary[]>;
  /**
   * Load the full detail for the owner's conversation `id`, or `null` when absent.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @returns The detail, or `null` on miss.
   */
  load(owner: string, id: string): Promise<ConversationDetail | null>;
  /**
   * Persist a turn for `(owner, id)` under optimistic concurrency. Creates a revision-1 row when
   * absent; on a mismatched `baseRevision` returns a conflict without mutating; otherwise replaces
   * messages and bumps `revision` and `updatedAt`.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @param messages - The full conversation to persist.
   * @param baseRevision - The revision the turn was based on, for conflict detection.
   * @returns The save outcome.
   */
  saveTurn(
    owner: string,
    id: string,
    messages: UIMessage[],
    baseRevision?: number,
  ): Promise<SaveResult>;
  /**
   * Set the title for `(owner, id)` only; never bumps `revision` or `updatedAt`.
   * @param owner - The conversation owner. @param id - The conversation id.
   * @param title - The new title.
   */
  rename(owner: string, id: string, title: string): Promise<void>;
  /**
   * Set or clear the pin for `(owner, id)`. Writes `pinned_at` ONLY (now-seconds when pinning,
   * null when unpinning); never bumps `revision` or `updated_at`, so pinning neither reorders
   * recency nor spends the concurrency token. A single atomic UPDATE: it both checks existence and
   * writes in one statement, so the caller need not pre-load to guard.
   * @param owner - The conversation owner. @param id - The conversation id.
   * @param pinned - True to pin (now-seconds), false to unpin (null).
   * @returns `true` when a matching `(owner, id)` row was updated, `false` when none existed.
   */
  setPinned(owner: string, id: string, pinned: boolean): Promise<boolean>;
  /**
   * Branch `(owner, sourceId)` into a brand-new `newId` row at `revision = 1`. Copies the source's
   * message prefix `messages[0..throughIndex]` inclusive (or ALL messages when `throughIndex` is
   * undefined) plus the source's `reasoning_override`, sets the lineage columns
   * (`forkedFromId = sourceId`, `forkedFromMessageId = the prefix's last message id or null`), and
   * leaves the new row unpinned (`pinned_at = null`). Title rule: when `throughIndex` is undefined
   * the title is `Branch of <source title>` (or `Branch of Untitled conversation` when the stored
   * title is empty), capped at 200 chars; when `throughIndex` is provided the title is
   * `deriveConversationTitle(prefix)`. Transactional and conflict-aware: a missing source returns
   * `not-found`; a `baseRevision` mismatch returns `conflict` with `currentRevision`; an existing
   * `newId` returns `collision`; a `throughIndex >= source.messages.length` returns `bad-index`.
   *
   * @param owner - The conversation owner (both rows are owner-scoped).
   * @param sourceId - The source conversation to branch from.
   * @param newId - The brand-new conversation id to create (must not already exist).
   * @param throughIndex - The inclusive last message index to copy, or undefined to copy all.
   * @param baseRevision - The source revision the caller based this branch on, for conflict detection.
   * @returns The branch outcome (the new summary on success, a reason on failure).
   */
  branch(
    owner: string,
    sourceId: string,
    newId: string,
    throughIndex: number | undefined,
    baseRevision: number,
  ): Promise<BranchResult>;
  /**
   * Delete the `(owner, id)` conversation (a no-op when absent or owned by another).
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   */
  delete(owner: string, id: string): Promise<void>;
  /**
   * Delete every owner-scoped conversation whose id is in `ids`; an empty `ids` is a no-op.
   *
   * @param owner - The conversation owner.
   * @param ids - The conversation ids to delete.
   */
  deleteMany(owner: string, ids: string[]): Promise<void>;
  /**
   * Rewrite the `messages` JSON for `(owner, id)` after a heal-on-read; never bumps `revision`
   * or `updatedAt`.
   * @param owner - The conversation owner. @param id - The conversation id.
   * @param messages - The healed conversation messages.
   */
  healMessages(owner: string, id: string, messages: UIMessage[]): Promise<void>;
}

/** Id-keyed per-conversation model-id override. Never creates a row. */
export interface IdModelOverrideStore {
  /**
   * Read the model override for `(owner, id)`: null on miss, null column, or a corrupt (non-string)
   * value (fail-soft with a content-safe warn). @param owner @param id @returns The stored model id or `null`.
   */
  getModelOverride(owner: string, id: string): Promise<string | null>;
  /**
   * Write the model override for `(owner, id)` - override column ONLY, no `revision`/`updatedAt`
   * bump, no row creation. Pass `null` to clear. @param owner @param id @param value
   */
  setModelOverride(owner: string, id: string, value: string | null): Promise<void>;
}

/** Id-keyed per-conversation reasoning override. Never creates a row. */
export interface IdReasoningOverrideStore {
  /**
   * Read the override for `(owner, id)`: null on miss, null column, or a corrupt value (fail-soft
   * with a content-safe warn). @param owner @param id @returns The stored effort or `null`.
   */
  getReasoningOverride(owner: string, id: string): Promise<ReasoningEffort | null>;
  /**
   * Write the override for `(owner, id)` - override column ONLY, no `revision`/`updatedAt` bump,
   * no row creation. Pass `null` to clear. @param owner @param id @param value
   */
  setReasoningOverride(owner: string, id: string, value: ReasoningEffort | null): Promise<void>;
}

/** Per-owner pointer to the last-active conversation, backing root-entry restore. */
export interface ActiveConversationStore {
  /** Read the owner's last-active conversation id, or `null` when unset. @param owner */
  getActiveId(owner: string): Promise<string | null>;
  /** Upsert the pointer; pass `null` to clear (empty-list case). @param owner @param id */
  setActiveId(owner: string, id: string | null): Promise<void>;
}

/** A persisted settings row: the raw stored JSON plus the schema version it was written at. */
export interface StoredSettings {
  /** The stored settings JSON (pre-migration; validated/migrated by the settings service). */
  data: unknown;
  /** The schema version the row was written at (drives migrate-on-read). */
  version: number;
}

/**
 * The persistence port for the single settings row. Like the other persistence ports, the server
 * depends on this interface, not on Drizzle; tests inject an in-memory fake. `load` returns `null`
 * when no row exists (first run); `save` upserts the whole settings object at `version`.
 */
export interface SettingsStore {
  /**
   * Load the persisted settings row for `owner`, or `null` when none exists (no write on read).
   * @param owner - The settings owner (always `OWNER_LOCAL`).
   * @returns The stored row, or `null`.
   */
  load(owner: string): Promise<StoredSettings | null>;
  /**
   * Persist (upsert) the whole settings `data` for `owner` at schema `version`, replacing any prior row.
   * @param owner - The settings owner.
   * @param data - The full validated settings object to store as JSON.
   * @param version - The schema version `data` conforms to.
   */
  save(owner: string, data: unknown, version: number): Promise<void>;
}
