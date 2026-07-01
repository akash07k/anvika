import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';

import { mapTurnOutcome } from './conversation-outcome';

const incoming = [{ id: 'u1', role: 'user', parts: [] }] as UIMessage[];
const finalMessages = [
  { id: 'u1', role: 'user', parts: [] },
  { id: 'a1', role: 'assistant', parts: [] },
] as UIMessage[];

describe('mapTurnOutcome', () => {
  it('computes status completed on a normal finish, carrying both message lists', () => {
    const outcome = mapTurnOutcome({
      isAborted: false,
      streamErrored: false,
      finalMessages,
      incomingMessages: incoming,
    });
    expect(outcome).toEqual({ status: 'completed', finalMessages, incomingMessages: incoming });
  });

  it('computes status aborted when the stream was aborted', () => {
    const outcome = mapTurnOutcome({
      isAborted: true,
      streamErrored: false,
      finalMessages,
      incomingMessages: incoming,
    });
    expect(outcome.status).toBe('aborted');
  });

  it('computes status error on a stream error, with abort taking precedence', () => {
    expect(
      mapTurnOutcome({
        isAborted: false,
        streamErrored: true,
        finalMessages,
        incomingMessages: incoming,
      }).status,
    ).toBe('error');
    expect(
      mapTurnOutcome({
        isAborted: true,
        streamErrored: true,
        finalMessages,
        incomingMessages: incoming,
      }).status,
    ).toBe('aborted');
  });

  it('always carries both message lists unchanged regardless of status', () => {
    const outcome = mapTurnOutcome({
      isAborted: false,
      streamErrored: true,
      finalMessages,
      incomingMessages: incoming,
    });
    expect(outcome.finalMessages).toBe(finalMessages);
    expect(outcome.incomingMessages).toBe(incoming);
  });
});
