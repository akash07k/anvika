import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as messageHeadingFocus from '../../components/message/messageHeadingFocus';
import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import * as queries from '../../lib/conversation/conversationQueries';
import * as notifier from '../../notifications/notifier';
import { useSyncMessagesFromDetail } from './useSyncMessagesFromDetail';

vi.mock('../../components/message/messageHeadingFocus', () => ({
  focusedMessageDomId: vi.fn(() => null),
  restoreFocusAfterReseed: vi.fn(),
}));

const M = (id: string, role: 'user' | 'assistant' = 'user', text = ''): AnvikaUIMessage =>
  ({ id, role, parts: text ? [{ type: 'text', text }] : [] }) as AnvikaUIMessage;
function detail(revision: number, messages: AnvikaUIMessage[]) {
  return { data: { messages, revision, title: '', reasoningOverride: null } };
}
function mockDetail(revision: number, messages: AnvikaUIMessage[]): void {
  vi.spyOn(queries, 'useConversationDetail').mockReturnValue(detail(revision, messages) as never);
}
afterEach(() => vi.restoreAllMocks());

describe('useSyncMessagesFromDetail', () => {
  it('re-seeds and announces exactly once on a remote update while idle', () => {
    const setMessages = vi.fn();
    const notify = vi.spyOn(notifier, 'notify');
    mockDetail(1, [M('a')]);
    const { rerender } = renderHook(
      (p: { messages: AnvikaUIMessage[] }) =>
        useSyncMessagesFromDetail({
          conversationId: 'jwq-112',
          isBusy: false,
          isEditing: false,
          messages: p.messages,
          setMessages,
        }),
      { initialProps: { messages: [M('a')] } },
    );
    expect(setMessages).not.toHaveBeenCalled();
    mockDetail(2, [M('a'), M('b')]);
    rerender({ messages: [M('a')] });
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ type: 'conversationUpdatedElsewhere' });
    // A further render at the SAME revision must not re-seed or re-announce (revision-gated).
    rerender({ messages: [M('a')] });
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-seed or announce for this tab's own turn (transcript already matches)", () => {
    const setMessages = vi.fn();
    const notify = vi.spyOn(notifier, 'notify');
    mockDetail(1, [M('a')]);
    const { rerender } = renderHook(
      (p: { messages: AnvikaUIMessage[] }) =>
        useSyncMessagesFromDetail({
          conversationId: 'jwq-112',
          isBusy: false,
          isEditing: false,
          messages: p.messages,
          setMessages,
        }),
      { initialProps: { messages: [M('a')] } },
    );
    mockDetail(2, [M('a'), M('b')]);
    rerender({ messages: [M('a'), M('b')] });
    expect(setMessages).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('re-seeds on a remote edit that keeps message ids but changes text', () => {
    const setMessages = vi.fn();
    const notify = vi.spyOn(notifier, 'notify');
    mockDetail(1, [M('u1', 'user', 'old')]);
    const { rerender } = renderHook(
      (p: { messages: AnvikaUIMessage[] }) =>
        useSyncMessagesFromDetail({
          conversationId: 'jwq-112',
          isBusy: false,
          isEditing: false,
          messages: p.messages,
          setMessages,
        }),
      { initialProps: { messages: [M('u1', 'user', 'old')] } },
    );
    // Same id and length, only the text changed (a remote edit of a trailing user message). An
    // ids-only check would miss this and leave the transcript stale.
    mockDetail(2, [M('u1', 'user', 'new')]);
    rerender({ messages: [M('u1', 'user', 'old')] });
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ type: 'conversationUpdatedElsewhere' });
  });

  it('re-seeds on a remote truncate (fewer messages than this tab shows)', () => {
    const setMessages = vi.fn();
    mockDetail(1, [M('a'), M('b')]);
    const { rerender } = renderHook(
      (p: { messages: AnvikaUIMessage[] }) =>
        useSyncMessagesFromDetail({
          conversationId: 'jwq-112',
          isBusy: false,
          isEditing: false,
          messages: p.messages,
          setMessages,
        }),
      { initialProps: { messages: [M('a'), M('b')] } },
    );
    mockDetail(2, [M('a')]);
    rerender({ messages: [M('a'), M('b')] });
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledWith([M('a')]);
  });

  it('captures focus before a remote re-seed and restores it after', () => {
    const setMessages = vi.fn();
    const restore = vi.mocked(messageHeadingFocus.restoreFocusAfterReseed);
    vi.mocked(messageHeadingFocus.focusedMessageDomId).mockReturnValue('a');
    restore.mockClear();
    mockDetail(1, [M('a')]);
    const { rerender } = renderHook(
      (p: { messages: AnvikaUIMessage[] }) =>
        useSyncMessagesFromDetail({
          conversationId: 'jwq-112',
          isBusy: false,
          isEditing: false,
          messages: p.messages,
          setMessages,
        }),
      { initialProps: { messages: [M('a')] } },
    );
    mockDetail(2, [M('a'), M('b')]);
    rerender({ messages: [M('a')] });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith('a', [M('a'), M('b')]);
  });

  it('does NOT re-seed while busy, then applies and announces on the next idle render', () => {
    const setMessages = vi.fn();
    const notify = vi.spyOn(notifier, 'notify');
    mockDetail(1, [M('a')]);
    const { rerender } = renderHook(
      (p: { isBusy: boolean; messages: AnvikaUIMessage[] }) =>
        useSyncMessagesFromDetail({
          conversationId: 'jwq-112',
          isBusy: p.isBusy,
          isEditing: false,
          messages: p.messages,
          setMessages,
        }),
      { initialProps: { isBusy: true, messages: [M('a')] } },
    );
    mockDetail(2, [M('a'), M('b')]);
    rerender({ isBusy: true, messages: [M('a')] });
    expect(setMessages).not.toHaveBeenCalled();
    rerender({ isBusy: false, messages: [M('a')] });
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ type: 'conversationUpdatedElsewhere' });
  });

  it('does NOT re-seed while an inline edit is open', () => {
    const setMessages = vi.fn();
    mockDetail(1, [M('a')]);
    const { rerender } = renderHook(
      (p: { messages: AnvikaUIMessage[] }) =>
        useSyncMessagesFromDetail({
          conversationId: 'jwq-112',
          isBusy: false,
          isEditing: true,
          messages: p.messages,
          setMessages,
        }),
      { initialProps: { messages: [M('a')] } },
    );
    mockDetail(2, [M('a'), M('b')]);
    rerender({ messages: [M('a')] });
    expect(setMessages).not.toHaveBeenCalled();
  });

  it('no-ops for a draft (no detail)', () => {
    const setMessages = vi.fn();
    vi.spyOn(queries, 'useConversationDetail').mockReturnValue({ data: null } as never);
    renderHook(() =>
      useSyncMessagesFromDetail({
        conversationId: undefined,
        isBusy: false,
        isEditing: false,
        messages: [],
        setMessages,
      }),
    );
    expect(setMessages).not.toHaveBeenCalled();
  });
});
