/** A minimal record guard so fields can be read off an unknown message without `any`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Remove content-free assistant turns (an empty `parts` array) from a RAW, pre-validation message
 * list. An errored or aborted turn can leave the client holding an assistant message that streamed
 * nothing before it failed; the AI SDK UIMessage schema requires at least one part, so on the NEXT
 * send the whole history fails `safeValidateUIMessages` ("Message must contain at least one part")
 * and the turn is rejected with a 400 ("Invalid messages") - poisoning the conversation. Dropping
 * these content-free assistant turns before validation keeps the conversation usable; every
 * surviving message is still fully validated at the boundary. Reads only `role` and `parts.length`
 * (content-free); leaves user messages and any assistant turn that carries at least one part intact.
 *
 * @param messages - The raw request messages (each an unknown, pre-UIMessage value).
 * @returns The messages without content-free assistant turns.
 */
export function stripEmptyAssistantTurns(messages: unknown[]): unknown[] {
  return messages.filter((m) => {
    if (!isRecord(m)) return true;
    return !(m.role === 'assistant' && Array.isArray(m.parts) && m.parts.length === 0);
  });
}
