import type { UIMessage } from 'ai';

/**
 * The domain result of one chat turn, mapped from the AI SDK's finish signals so nothing
 * downstream of `streamChat` touches an AI-SDK type (ADR 0009). It carries BOTH message lists;
 * the pure `conversation-persistence` module owns the save policy: finalMessages on
 * completed; the marked partial assistant turn on error/aborted when it has content, else the user
 * turn (error) or nothing (aborted). `streamChat` carries no policy - it only maps signals to this
 * shape.
 */
export interface ChatTurnOutcome {
  /** Whether the turn completed, was stopped by the user, or errored. */
  status: 'completed' | 'aborted' | 'error';
  /** The SDK-assembled messages including the assistant response (persistence-mode onFinish). */
  finalMessages: UIMessage[];
  /** The request's incoming messages (the user turn). */
  incomingMessages: UIMessage[];
  /** The server-resolved `connectionId:model` id for the turn, used to stamp the model on an
   *  incomplete (error/abort) turn that no finished step labelled. */
  resolvedModelId?: string | undefined;
}

/**
 * Map the AI SDK finish signals into a {@link ChatTurnOutcome}: compute `status` and bundle both
 * message lists unchanged (no save policy here - that lives in `conversation-persistence`). Pure
 * and deterministic so every status branch is unit-tested directly rather than by forcing SDK
 * error states through a mock. Abort takes precedence over error.
 *
 * @param args - `isAborted` and `streamErrored` from the SDK, plus the final and incoming
 *   message lists.
 * @returns The mapped outcome carrying both lists.
 */
export function mapTurnOutcome(args: {
  isAborted: boolean;
  streamErrored: boolean;
  finalMessages: UIMessage[];
  incomingMessages: UIMessage[];
  resolvedModelId?: string | undefined;
}): ChatTurnOutcome {
  const status = args.isAborted ? 'aborted' : args.streamErrored ? 'error' : 'completed';
  return {
    status,
    finalMessages: args.finalMessages,
    incomingMessages: args.incomingMessages,
    ...(args.resolvedModelId !== undefined ? { resolvedModelId: args.resolvedModelId } : {}),
  };
}
