import { isReasoningUIPart, isTextUIPart } from 'ai';

import type { AnvikaUIMessage } from './anvikaMessage';

/** The phase a streaming assistant turn is in: thinking (reasoning, no answer yet) or answering. */
export type GenerationPhase = 'thinking' | 'answering';

/**
 * Derive the current generation phase from the in-flight assistant message: `'thinking'` when it
 * has at least one reasoning part and no text part yet, otherwise `'answering'` (including when
 * there is no in-flight message). The first text part starts the answer phase, so the heartbeat and
 * announcements switch exactly once per turn.
 *
 * @param message - The latest (streaming) assistant message, or undefined when none is in flight.
 * @returns The current {@link GenerationPhase}.
 */
export function generationPhaseOf(message: AnvikaUIMessage | undefined): GenerationPhase {
  if (!message) return 'answering';
  const hasReasoning = message.parts.some(isReasoningUIPart);
  const hasText = message.parts.some(isTextUIPart);
  return hasReasoning && !hasText ? 'thinking' : 'answering';
}
