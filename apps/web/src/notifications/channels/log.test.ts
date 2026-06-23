import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({ clientLog: vi.fn() }));

import { MAX_MILESTONE_TEXT } from '@anvika/shared/client-log';

import { clientLog } from '../../lib/logger';
import { useRuntimeConfigStore } from '../../stores/runtimeConfigStore';
import { logChannel } from './log';

beforeEach(() => {
  vi.mocked(clientLog).mockClear();
});

describe('logChannel', () => {
  it('forwards milestones (type only, never payload)', () => {
    logChannel({ type: 'messageSent' });
    expect(clientLog).toHaveBeenCalledWith('notify-message-sent');

    logChannel({ type: 'settingsSaved' });
    expect(clientLog).toHaveBeenCalledWith('notify-settings-saved');

    logChannel({ type: 'generationComplete', text: 'secret response', readWhole: true });
    expect(clientLog).toHaveBeenCalledWith('notify-generation-complete');
    expect(clientLog).not.toHaveBeenCalledWith(expect.stringContaining('secret'));
  });

  it('forwards the error notification (code only, never the message)', () => {
    logChannel({ type: 'error', message: 'Choose a model in Settings.' });
    expect(clientLog).toHaveBeenCalledWith('notify-error');
    expect(clientLog).not.toHaveBeenCalledWith(expect.stringContaining('Choose'));
  });

  it('forwards the conversation-changed-elsewhere conflict by code only (content-safe)', () => {
    logChannel({ type: 'conversationChangedElsewhere' });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-changed-elsewhere');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the conversation-updated-elsewhere cross-tab sync by code only (content-safe)', () => {
    logChannel({ type: 'conversationUpdatedElsewhere' });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-updated-elsewhere');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the conversation-created milestone by code only (content-safe)', () => {
    logChannel({ type: 'conversationCreated' });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-created');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the conversation-renamed milestone by code only (never the title)', () => {
    logChannel({ type: 'conversationRenamed' });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-renamed');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the conversation-deleted milestone by code only (content-safe)', () => {
    logChannel({ type: 'conversationDeleted' });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-deleted');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the batch-delete milestone by code only (never the count)', () => {
    logChannel({ type: 'conversationsBatchDeleted', count: 3 });
    expect(clientLog).toHaveBeenCalledWith('notify-conversations-batch-deleted');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the conversation rename/delete/batch-delete failures by code only (content-safe)', () => {
    logChannel({ type: 'conversationRenameFailed' });
    expect(clientLog).toHaveBeenLastCalledWith('notify-conversation-rename-failed');
    logChannel({ type: 'conversationDeleteFailed' });
    expect(clientLog).toHaveBeenLastCalledWith('notify-conversation-delete-failed');
    logChannel({ type: 'conversationsBatchDeleteFailed' });
    expect(clientLog).toHaveBeenLastCalledWith('notify-conversations-batch-delete-failed');
    expect(clientLog).toHaveBeenCalledTimes(3);
  });

  it('forwards the conversation pin/unpin milestones by code only (never the id or title)', () => {
    logChannel({ type: 'conversationPinned' });
    expect(clientLog).toHaveBeenLastCalledWith('notify-conversation-pinned');
    logChannel({ type: 'conversationUnpinned' });
    expect(clientLog).toHaveBeenLastCalledWith('notify-conversation-unpinned');
    expect(clientLog).toHaveBeenCalledTimes(2);
  });

  it('forwards the conversation pin failure by code only (content-safe)', () => {
    logChannel({ type: 'conversationPinFailed' });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-pin-failed');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the conversation-branched milestone by code only (never the id or title)', () => {
    logChannel({ type: 'conversationBranched' });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-branched');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the conversation branch failure by code only (content-safe)', () => {
    logChannel({ type: 'conversationBranchFailed' });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-branch-failed');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the conversation-switched milestone by code only (never the slot, id, or title)', () => {
    logChannel({ type: 'conversationSwitched', slot: 3 });
    expect(clientLog).toHaveBeenCalledWith('notify-conversation-switched');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('does not forward the empty quick-nav slot (speech-only no-op, like quickNavEmpty)', () => {
    logChannel({ type: 'conversationQuickNavEmpty' });
    expect(clientLog).not.toHaveBeenCalled();
  });

  it('forwards the message-regenerating milestone by code only (never the id or text)', () => {
    logChannel({ type: 'messageRegenerating' });
    expect(clientLog).toHaveBeenCalledWith('notify-message-regenerating');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the message-edited milestone by code only (never the id or text)', () => {
    logChannel({ type: 'messageEdited' });
    expect(clientLog).toHaveBeenCalledWith('notify-message-edited');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the message-edit-started milestone by code only (never the id or text)', () => {
    logChannel({ type: 'messageEditStarted' });
    expect(clientLog).toHaveBeenCalledWith('notify-message-edit-started');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the latest-message-edit-started milestone by code only (never the id or text)', () => {
    logChannel({ type: 'latestMessageEditStarted' });
    expect(clientLog).toHaveBeenCalledWith('notify-latest-message-edit-started');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('forwards the message-edit-cancelled milestone by code only (never the id or text)', () => {
    logChannel({ type: 'messageEditCancelled' });
    expect(clientLog).toHaveBeenCalledWith('notify-message-edit-cancelled');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('does NOT forward the periodic generationProgress event (would flood the log)', () => {
    logChannel({ type: 'generationProgress', seconds: 4 });
    expect(clientLog).not.toHaveBeenCalled();
  });

  it('does not forward quickNavRead (superseded by the keyboard diagnostic)', () => {
    logChannel({ type: 'quickNavRead', text: 'hello' });
    expect(clientLog).not.toHaveBeenCalled();
  });

  it('does not forward quickNavAlreadyFocused (superseded by the richer quickNavResolved diagnostic)', () => {
    logChannel({ type: 'quickNavAlreadyFocused' });
    expect(clientLog).not.toHaveBeenCalled();
  });

  it('forwards connection CRUD milestones by code only, never the label', () => {
    logChannel({ type: 'connectionSaved', label: 'Venice' });
    expect(clientLog).toHaveBeenCalledWith('notify-connection-saved');

    logChannel({ type: 'connectionSaveFailed', label: 'Venice' });
    expect(clientLog).toHaveBeenCalledWith('notify-connection-save-failed');

    expect(clientLog).not.toHaveBeenCalledWith(expect.stringContaining('Venice'));
  });
});

describe('logChannel content gating', () => {
  afterEach(() => useRuntimeConfigStore.setState({ logContent: false }));

  it('forwards codes only and skips quickNavRead when content logging is off', () => {
    logChannel({ type: 'error', message: 'secret detail' });
    logChannel({ type: 'quickNavRead', text: 'the message body' });
    expect(clientLog).toHaveBeenCalledWith('notify-error');
    expect(clientLog).not.toHaveBeenCalledWith('notify-quick-nav-read', expect.anything());
  });

  it('attaches text for the three content-bearing events when content logging is on', () => {
    useRuntimeConfigStore.setState({ logContent: true });
    logChannel({ type: 'error', message: 'network failed' });
    logChannel({ type: 'quickNavRead', text: 'read aloud body' });
    logChannel({ type: 'generationComplete', text: 'assistant reply', readWhole: false });
    expect(clientLog).toHaveBeenCalledWith('notify-error', 'network failed');
    expect(clientLog).toHaveBeenCalledWith('notify-quick-nav-read', 'read aloud body');
    expect(clientLog).toHaveBeenCalledWith('notify-generation-complete', 'assistant reply');
  });

  it('truncates attached text to the cap', () => {
    useRuntimeConfigStore.setState({ logContent: true });
    logChannel({ type: 'error', message: 'x'.repeat(MAX_MILESTONE_TEXT + 50) });
    const [, text] = vi.mocked(clientLog).mock.calls[0] as [string, string];
    expect(text).toHaveLength(MAX_MILESTONE_TEXT);
  });

  it('does not attach empty text, even with content logging on', () => {
    useRuntimeConfigStore.setState({ logContent: true });
    // An empty error message forwards the code only (no empty second arg); empty quick-nav text is
    // not forwarded at all (its line exists only to carry text under the opt-in).
    logChannel({ type: 'error', message: '' });
    logChannel({ type: 'quickNavRead', text: '' });
    expect(clientLog).toHaveBeenCalledWith('notify-error');
    expect(clientLog).not.toHaveBeenCalledWith('notify-error', expect.anything());
    expect(clientLog).not.toHaveBeenCalledWith('notify-quick-nav-read', expect.anything());
  });
});
