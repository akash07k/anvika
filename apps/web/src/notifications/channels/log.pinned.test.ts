import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({ clientLog: vi.fn() }));

import { clientLog } from '../../lib/logger';
import { logChannel } from './log';

beforeEach(() => {
  vi.mocked(clientLog).mockClear();
});

describe('logChannel (pinned-conversation shortcuts)', () => {
  it('forwards the pinned-conversation-switched milestone by code only (never the slot, id, or title)', () => {
    logChannel({ type: 'pinnedConversationSwitched', slot: 2 });
    expect(clientLog).toHaveBeenCalledWith('notify-pinned-conversation-switched');
    expect(clientLog).toHaveBeenCalledTimes(1);
  });

  it('does not forward the pinned quick-nav / no-pinned / cannot-pin-empty / list-loading no-ops (speech-only)', () => {
    logChannel({ type: 'pinnedQuickNavEmpty' });
    logChannel({ type: 'noPinnedConversations' });
    logChannel({ type: 'cannotPinEmptyConversation' });
    logChannel({ type: 'conversationListLoading' });
    expect(clientLog).not.toHaveBeenCalled();
  });
});
