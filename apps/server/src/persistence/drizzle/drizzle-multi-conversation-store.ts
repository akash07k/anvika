import type { UIMessage } from 'ai';

import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

import type {
  ActiveConversationStore,
  BranchResult,
  ConversationDetail,
  ConversationSummary,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
  SaveResult,
} from '../ports';
import type { AnvikaDb } from './connection';
import { DrizzleActiveConversation } from './drizzle-active-conversation';
import { DrizzleConversationBranch } from './drizzle-conversation-branch';
import { DrizzleConversationRead } from './drizzle-conversation-read';
import { DrizzleConversationWrite } from './drizzle-conversation-write';

/**
 * The Drizzle-over-Bun-SQLite implementation of {@link MultiConversationStore},
 * {@link IdReasoningOverrideStore}, {@link IdModelOverrideStore}, and
 * {@link ActiveConversationStore}. It composes the cohesive read/write conversation modules and
 * the active-conversation module, delegating each port method.
 */
export class DrizzleMultiConversationStore
  implements
    MultiConversationStore,
    IdReasoningOverrideStore,
    IdModelOverrideStore,
    ActiveConversationStore
{
  private readonly reader: DrizzleConversationRead;
  private readonly writer: DrizzleConversationWrite;
  private readonly brancher: DrizzleConversationBranch;
  private readonly active: DrizzleActiveConversation;

  /** @param db - The typed Drizzle database handle. */
  constructor(db: AnvikaDb) {
    this.reader = new DrizzleConversationRead(db);
    this.writer = new DrizzleConversationWrite(db);
    this.brancher = new DrizzleConversationBranch(db);
    this.active = new DrizzleActiveConversation(db);
  }

  /** @inheritDoc */
  list(owner: string): Promise<ConversationSummary[]> {
    return this.reader.list(owner);
  }

  /** @inheritDoc */
  load(owner: string, id: string): Promise<ConversationDetail | null> {
    return this.reader.load(owner, id);
  }

  /** @inheritDoc */
  saveTurn(
    owner: string,
    id: string,
    messages: UIMessage[],
    baseRevision?: number,
  ): Promise<SaveResult> {
    return this.writer.saveTurn(owner, id, messages, baseRevision);
  }

  /** @inheritDoc */
  rename(owner: string, id: string, title: string): Promise<void> {
    return this.writer.rename(owner, id, title);
  }

  /** @inheritDoc */
  setPinned(owner: string, id: string, pinned: boolean): Promise<boolean> {
    return this.writer.setPinned(owner, id, pinned);
  }

  /** @inheritDoc */
  branch(
    owner: string,
    sourceId: string,
    newId: string,
    throughIndex: number | undefined,
    baseRevision: number,
  ): Promise<BranchResult> {
    return this.brancher.branch(owner, sourceId, newId, throughIndex, baseRevision);
  }

  /** @inheritDoc */
  delete(owner: string, id: string): Promise<void> {
    return this.writer.delete(owner, id);
  }

  /** @inheritDoc */
  deleteMany(owner: string, ids: string[]): Promise<void> {
    return this.writer.deleteMany(owner, ids);
  }

  /** @inheritDoc */
  healMessages(owner: string, id: string, messages: UIMessage[]): Promise<void> {
    return this.writer.healMessages(owner, id, messages);
  }

  /** @inheritDoc */
  getReasoningOverride(owner: string, id: string): Promise<ReasoningEffort | null> {
    return this.reader.getReasoningOverride(owner, id);
  }

  /** @inheritDoc */
  setReasoningOverride(owner: string, id: string, value: ReasoningEffort | null): Promise<void> {
    return this.writer.setReasoningOverride(owner, id, value);
  }

  /** @inheritDoc */
  getModelOverride(owner: string, id: string): Promise<string | null> {
    return this.reader.getModelOverride(owner, id);
  }

  /** @inheritDoc */
  setModelOverride(owner: string, id: string, value: string | null): Promise<void> {
    return this.writer.setModelOverride(owner, id, value);
  }

  /** @inheritDoc */
  getActiveId(owner: string): Promise<string | null> {
    return this.active.getActiveId(owner);
  }

  /** @inheritDoc */
  setActiveId(owner: string, id: string | null): Promise<void> {
    return this.active.setActiveId(owner, id);
  }
}
