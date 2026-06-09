import { describe, expect, it } from 'vitest';

import { isMessageSpeechEvent, messageForMessageEvent } from './messageSpeech';

describe('messageForMessageEvent', () => {
  it('announces a per-message regenerate high-priority and content-safely (no id or text)', () => {
    expect(messageForMessageEvent({ type: 'messageRegenerating' })).toEqual({
      message: 'Regenerating response',
      priority: 'high',
    });
  });

  it('announces a message edit submit high-priority and content-safely (no id or text)', () => {
    expect(messageForMessageEvent({ type: 'messageEdited' })).toEqual({
      message: 'Message edited, generating response',
      priority: 'high',
    });
  });

  it('announces a menu Edit open high-priority and content-safely (no id or text)', () => {
    expect(messageForMessageEvent({ type: 'messageEditStarted' })).toEqual({
      message: 'Editing message',
      priority: 'high',
    });
  });

  it('announces a Ctrl+Up latest-message edit open high-priority and content-safely (no id or text)', () => {
    expect(messageForMessageEvent({ type: 'latestMessageEditStarted' })).toEqual({
      message: 'Editing last message',
      priority: 'high',
    });
  });

  it('announces an edit cancel high-priority and content-safely (no id or text)', () => {
    expect(messageForMessageEvent({ type: 'messageEditCancelled' })).toEqual({
      message: 'Editing cancelled',
      priority: 'high',
    });
  });

  it('announces the edit-while-generating guard high-priority and content-safely (fixed phrase)', () => {
    expect(messageForMessageEvent({ type: 'editUnavailableWhileGenerating' })).toEqual({
      message: 'Cannot edit while a response is generating',
      priority: 'high',
    });
  });

  it('announces a failed message action high-priority and content-safely (fixed phrase)', () => {
    expect(messageForMessageEvent({ type: 'messageActionFailed' })).toEqual({
      message: 'That action could not be completed',
      priority: 'high',
    });
  });
});

describe('isMessageSpeechEvent', () => {
  it('recognizes every per-message event type', () => {
    for (const type of [
      'messageRegenerating',
      'messageEdited',
      'messageEditStarted',
      'latestMessageEditStarted',
      'messageEditCancelled',
      'editUnavailableWhileGenerating',
      'messageActionFailed',
    ] as const) {
      expect(isMessageSpeechEvent({ type })).toBe(true);
    }
  });

  it('rejects a non-message event so the speech switch still handles it', () => {
    expect(isMessageSpeechEvent({ type: 'messageSent' })).toBe(false);
    expect(isMessageSpeechEvent({ type: 'conversationBranched' })).toBe(false);
  });
});
