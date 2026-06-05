import { describe, expect, it } from 'vitest';

import type { AnvikaUIMessage } from './anvikaMessage';
import { generationPhaseOf } from './generationPhase';

/** An assistant message built from the given parts. */
function assistant(parts: AnvikaUIMessage['parts']): AnvikaUIMessage {
  return { id: 'a1', role: 'assistant', parts } as AnvikaUIMessage;
}

describe('generationPhaseOf', () => {
  it('is "thinking" when the latest message has reasoning but no text yet', () => {
    expect(generationPhaseOf(assistant([{ type: 'reasoning', text: 'pondering' }]))).toBe(
      'thinking',
    );
  });

  it('is "answering" once a text part has begun', () => {
    expect(
      generationPhaseOf(
        assistant([
          { type: 'reasoning', text: 'pondering' },
          { type: 'text', text: 'A' },
        ]),
      ),
    ).toBe('answering');
  });

  it('is "answering" for a plain message with no reasoning', () => {
    expect(generationPhaseOf(assistant([{ type: 'text', text: 'hi' }]))).toBe('answering');
  });

  it('is "answering" when there is no in-flight message', () => {
    expect(generationPhaseOf(undefined)).toBe('answering');
  });
});
