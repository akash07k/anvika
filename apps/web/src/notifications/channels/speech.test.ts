import { describe, expect, it, vi } from 'vitest';

vi.mock('../announce', () => ({ announce: vi.fn() }));

import { announce } from '../announce';
import { messageForEvent, speechChannel } from './speech';

describe('messageForEvent', () => {
  it('maps generation events to the spec wording and priority', () => {
    expect(messageForEvent({ type: 'generationStarted' })).toEqual({
      message: 'Generating response',
      priority: 'normal',
    });
    expect(messageForEvent({ type: 'generationProgress', seconds: 4 })).toEqual({
      message: 'Generating, 4 seconds',
      priority: 'normal',
    });
    expect(messageForEvent({ type: 'generationProgress', seconds: 1 })?.message).toBe(
      'Generating, 1 second',
    );
    expect(messageForEvent({ type: 'generationStopped' })).toEqual({
      message: 'Generation stopped',
      priority: 'normal',
    });
  });

  it('appends the full text on completion only when readWhole is set', () => {
    expect(
      messageForEvent({ type: 'generationComplete', text: 'Hi there', readWhole: false }),
    ).toEqual({
      message: 'Response complete',
      priority: 'normal',
    });
    expect(
      messageForEvent({ type: 'generationComplete', text: 'Hi there', readWhole: true })?.message,
    ).toBe('Response complete. Hi there');
  });

  it('announces errors at high priority and is silent for messageSent', () => {
    expect(messageForEvent({ type: 'error', message: 'Boom' })).toEqual({
      message: 'Boom',
      priority: 'high',
    });
    expect(messageForEvent({ type: 'messageSent' })).toBeNull();
  });

  it('announces a conversation-changed-elsewhere conflict assertively (high) and content-safely', () => {
    const result = messageForEvent({ type: 'conversationChangedElsewhere' });
    expect(result?.priority).toBe('high');
    expect(result?.message).toBe(
      'This conversation changed elsewhere. Your message was not sent; please resend.',
    );
  });

  it('announces a cross-tab update politely without content', () => {
    expect(messageForEvent({ type: 'conversationUpdatedElsewhere' })).toEqual({
      message: 'Conversation updated in another tab',
      priority: 'normal',
    });
  });

  it('announces a created conversation content-safely (no id or title)', () => {
    expect(messageForEvent({ type: 'conversationCreated' })).toEqual({
      message: 'New conversation',
      priority: 'normal',
    });
  });

  it('announces a renamed conversation high-priority and content-safely (no title)', () => {
    expect(messageForEvent({ type: 'conversationRenamed' })).toEqual({
      message: 'Conversation renamed',
      priority: 'high',
    });
  });

  it('announces a deleted conversation high-priority and content-safely (no id or title)', () => {
    expect(messageForEvent({ type: 'conversationDeleted' })).toEqual({
      message: 'Conversation deleted',
      priority: 'high',
    });
  });

  it('announces a batch delete high-priority with the count (pluralized, content-safe)', () => {
    expect(messageForEvent({ type: 'conversationsBatchDeleted', count: 3 })).toEqual({
      message: 'Deleted 3 conversations',
      priority: 'high',
    });
    expect(messageForEvent({ type: 'conversationsBatchDeleted', count: 1 })).toEqual({
      message: 'Deleted 1 conversation',
      priority: 'high',
    });
  });

  it('announces rename/delete/batch-delete failures high-priority and content-safely (fixed phrases)', () => {
    expect(messageForEvent({ type: 'conversationRenameFailed' })).toEqual({
      message: 'Could not rename the conversation. Please try again.',
      priority: 'high',
    });
    expect(messageForEvent({ type: 'conversationDeleteFailed' })).toEqual({
      message: 'Could not delete the conversation. Please try again.',
      priority: 'high',
    });
    expect(messageForEvent({ type: 'conversationsBatchDeleteFailed' })).toEqual({
      message: 'Could not delete the conversations. Please try again.',
      priority: 'high',
    });
  });

  it('announces pin and unpin high-priority and content-safely (no id or title)', () => {
    expect(messageForEvent({ type: 'conversationPinned' })).toEqual({
      message: 'Conversation pinned',
      priority: 'high',
    });
    expect(messageForEvent({ type: 'conversationUnpinned' })).toEqual({
      message: 'Conversation unpinned',
      priority: 'high',
    });
  });

  it('announces a pin failure high-priority and content-safely (fixed phrase)', () => {
    expect(messageForEvent({ type: 'conversationPinFailed' })).toEqual({
      message: 'Could not change the pin. Please try again.',
      priority: 'high',
    });
  });

  it('announces a branch high-priority and content-safely (no id or title)', () => {
    expect(messageForEvent({ type: 'conversationBranched' })).toEqual({
      message: 'Conversation branched',
      priority: 'high',
    });
  });

  it('announces a branch failure high-priority and content-safely (fixed phrase)', () => {
    expect(messageForEvent({ type: 'conversationBranchFailed' })).toEqual({
      message: 'Could not branch the conversation. Please try again.',
      priority: 'high',
    });
  });

  it('announces a quick-nav switch high-priority, naming only the slot ordinal (content-safe)', () => {
    expect(messageForEvent({ type: 'conversationSwitched', slot: 1 })).toEqual({
      message: 'Switched to the most recent conversation',
      priority: 'high',
    });
    // Slot 10 pins the `slot - 1` index math against an off-by-one (the last SLOT_ORDINALS entry).
    expect(messageForEvent({ type: 'conversationSwitched', slot: 10 })).toEqual({
      message: 'Switched to the 10th most recent conversation',
      priority: 'high',
    });
  });

  it('announces an empty quick-nav slot at normal priority and content-safely', () => {
    expect(messageForEvent({ type: 'conversationQuickNavEmpty' })).toEqual({
      message: 'No conversation in that slot',
      priority: 'normal',
    });
  });

  it('announces a model change at normal priority, naming only the model label (content-safe)', () => {
    expect(
      messageForEvent({ type: 'conversationModelChanged', model: 'Claude Sonnet (Anthropic)' }),
    ).toEqual({ message: 'Model set to Claude Sonnet (Anthropic)', priority: 'normal' });
  });

  it('announces a model-override save failure high-priority and content-safely (fixed phrase, no model)', () => {
    const result = messageForEvent({ type: 'modelOverrideSaveFailed' });
    expect(result).toEqual({
      message: 'Could not change the model. Please try again.',
      priority: 'high',
    });
    // Content-safety: the failure phrase never carries the attempted model id or a server error.
    expect(JSON.stringify(result)).not.toContain('openai');
  });

  it('delegates per-message events to the message-speech module (regenerate)', () => {
    // The message-speech wording lives in messageSpeech.ts; messageForEvent must delegate to it. Its
    // own exhaustive cases are covered in messageSpeech.test.ts.
    expect(messageForEvent({ type: 'messageRegenerating' })).toEqual({
      message: 'Regenerating response',
      priority: 'high',
    });
    expect(messageForEvent({ type: 'editUnavailableWhileGenerating' })).toEqual({
      message: 'Cannot edit while a response is generating',
      priority: 'high',
    });
  });

  it('maps copy, save, and quick-nav events', () => {
    expect(messageForEvent({ type: 'messageCopied' })?.message).toBe('Message copied');
    expect(messageForEvent({ type: 'settingsSaved' })?.message).toBe('Settings saved');
    expect(messageForEvent({ type: 'quickNavRead', text: 'a snippet' })?.message).toBe('a snippet');
  });

  it('maps the no-op feedback events to their notices', () => {
    expect(messageForEvent({ type: 'alreadyInComposer' })?.message).toBe(
      'Already in the message box',
    );
    expect(messageForEvent({ type: 'nothingToStop' })?.message).toBe('No response is generating');
    expect(messageForEvent({ type: 'composerEmpty' })?.message).toBe('Type a message to send');
    expect(messageForEvent({ type: 'noMessageForRole', role: 'assistant' })?.message).toBe(
      'No assistant response yet',
    );
    expect(messageForEvent({ type: 'noMessageForRole', role: 'user' })?.message).toBe(
      'You have not sent a message yet',
    );
    expect(messageForEvent({ type: 'quickNavEmpty' })?.message).toBe('No message there yet');
    expect(messageForEvent({ type: 'quickNavAlreadyFocused' })).toEqual({
      message: 'Already focused on this message',
      priority: 'normal',
    });
  });

  it('maps the send-key-mode toggle (platform-aware) and the not-ready notice', () => {
    expect(messageForEvent({ type: 'sendKeyModeChanged', mode: 'enter', isMac: false })).toEqual({
      message: 'Send key mode changed to Enter',
      priority: 'normal',
    });
    expect(
      messageForEvent({ type: 'sendKeyModeChanged', mode: 'modEnter', isMac: true })?.message,
    ).toBe('Send key mode changed to Command+Enter');
    expect(
      messageForEvent({ type: 'sendKeyModeChanged', mode: 'modEnter', isMac: false })?.message,
    ).toBe('Send key mode changed to Control+Enter');
    expect(messageForEvent({ type: 'settingsNotReady' })?.message).toBe(
      'Settings are still loading',
    );
  });

  it('maps the connection save and partial-failure events (content-safe label only)', () => {
    expect(messageForEvent({ type: 'connectionSaved', label: 'Venice' })).toEqual({
      message: 'Connection Venice saved',
      priority: 'normal',
    });
    expect(messageForEvent({ type: 'connectionSaveFailed', label: 'Venice' })).toEqual({
      message: 'Saved Venice, but setting its key failed. Edit the connection to try again.',
      priority: 'high',
    });
  });

  it('maps the connection test-OK and remove events (found wording; remove is high priority)', () => {
    expect(messageForEvent({ type: 'connectionTestOk', modelCount: 120 })).toEqual({
      message: 'Connection OK, found 120 models',
      priority: 'normal',
    });
    expect(messageForEvent({ type: 'connectionTestOk', modelCount: 1 })?.message).toBe(
      'Connection OK, found 1 model',
    );
    // A remove confirmation is high priority so it survives the dialog-close + focus-move churn.
    expect(
      messageForEvent({ type: 'connectionRemoved', label: 'Venice', modelCleared: false }),
    ).toEqual({ message: 'Connection Venice removed', priority: 'high' });
    expect(
      messageForEvent({ type: 'connectionRemoved', label: 'Venice', modelCleared: true })?.message,
    ).toBe('Connection Venice removed; selected model cleared');
  });

  it('announces the FX refresh lifecycle', () => {
    expect(messageForEvent({ type: 'fxRefreshStarted' })).toEqual({
      message: 'Updating exchange rate',
      priority: 'normal',
    });
    expect(messageForEvent({ type: 'fxRefreshOk', rate: 83.246 })).toEqual({
      message: 'Exchange rate updated. INR per USD is now 83.246.',
      priority: 'normal',
    });
    // A 2-decimal rate is spoken without a padded third zero (e.g. Frankfurter's 95.12, not 95.120).
    expect(messageForEvent({ type: 'fxRefreshOk', rate: 95.12 })?.message).toBe(
      'Exchange rate updated. INR per USD is now 95.12.',
    );
    expect(messageForEvent({ type: 'fxRefreshFailed' })).toEqual({
      message: 'Could not update the exchange rate. The existing rate is unchanged.',
      priority: 'high',
    });
  });

  it('maps the settings reload and degraded-load events', () => {
    expect(messageForEvent({ type: 'settingsReloaded' })).toEqual({
      message: 'Settings reloaded',
      priority: 'normal',
    });
    expect(messageForEvent({ type: 'settingsLoadDegraded' })).toEqual({
      message: 'Settings file could not be read; using defaults',
      priority: 'high',
    });
  });

  it('speaks the thinking wording when the progress tick is in the thinking phase', () => {
    expect(messageForEvent({ type: 'generationProgress', seconds: 6, thinking: true })).toEqual({
      message: 'Thinking, 6 seconds',
      priority: 'normal',
    });
  });

  it('keeps the generating wording when the progress tick is not thinking', () => {
    expect(messageForEvent({ type: 'generationProgress', seconds: 6 })?.message).toBe(
      'Generating, 6 seconds',
    );
  });
});

describe('models management announcements', () => {
  it('announces a connection enabled/disabled change (high priority)', () => {
    expect(
      messageForEvent({ type: 'connectionEnabledChanged', label: 'Local', enabled: false }),
    ).toEqual({
      message: 'Connection Local deactivated',
      priority: 'high',
    });
    expect(
      messageForEvent({ type: 'connectionEnabledChanged', label: 'Local', enabled: true })?.message,
    ).toBe('Connection Local activated');
  });

  it('announces the refresh lifecycle, naming problem connections', () => {
    expect(messageForEvent({ type: 'modelsRefreshStarted' })?.message).toBe('Refreshing models');
    expect(messageForEvent({ type: 'modelsRefreshOk', count: 5, problemLabels: [] })?.message).toBe(
      'Models refreshed, 5 models available',
    );
    expect(messageForEvent({ type: 'modelsRefreshOk', count: 1, problemLabels: [] })?.message).toBe(
      'Models refreshed, 1 model available',
    );
    expect(
      messageForEvent({ type: 'modelsRefreshOk', count: 3, problemLabels: ['Local', 'Venice'] })
        ?.message,
    ).toBe('Models refreshed, 3 models available. Could not load models from: Local, Venice.');
    expect(messageForEvent({ type: 'modelsRefreshFailed' })).toEqual({
      message: 'Could not refresh models. The existing list is unchanged.',
      priority: 'high',
    });
  });

  it('announces a newly detected discovery problem, naming the connections', () => {
    expect(messageForEvent({ type: 'modelDiscoveryProblem', labels: ['Local'] })).toEqual({
      message: 'Could not load models from: Local. Check the connections list.',
      priority: 'high',
    });
  });
});

describe('thinking lifecycle announcements', () => {
  it('announces the start of thinking', () => {
    expect(messageForEvent({ type: 'thinkingStarted' })).toEqual({
      message: 'Thinking',
      priority: 'normal',
    });
  });

  it('announces the thinking-to-answer transition with the elapsed seconds', () => {
    expect(messageForEvent({ type: 'thinkingComplete', seconds: 8 })).toEqual({
      message: 'Thought for 8 seconds. Answering.',
      priority: 'normal',
    });
  });

  it('uses the singular "second" for a one-second think', () => {
    expect(messageForEvent({ type: 'thinkingComplete', seconds: 1 })?.message).toBe(
      'Thought for 1 second. Answering.',
    );
  });
});

describe('speechChannel', () => {
  it('announces mapped events and skips silent ones', () => {
    speechChannel({ type: 'error', message: 'Boom' });
    expect(announce).toHaveBeenCalledWith('Boom', 'high');
    vi.mocked(announce).mockClear();
    speechChannel({ type: 'messageSent' });
    expect(announce).not.toHaveBeenCalled();
  });
});
