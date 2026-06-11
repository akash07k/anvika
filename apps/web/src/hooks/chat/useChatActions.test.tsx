import { renderHook, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportClientError } from '../../diagnostics/reportClientError';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useChatActions } from './useChatActions';

vi.mock('../../diagnostics/reportClientError', () => ({ reportClientError: vi.fn() }));

const events: NotificationEvent[] = [];

beforeEach(() => {
  events.length = 0;
  vi.mocked(reportClientError).mockClear();
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  resetChannels();
});

describe('useChatActions', () => {
  it('handleStop speaks nothingToStop and does not call stop when not busy', () => {
    const stop = vi.fn();
    const composerRef = createRef<HTMLTextAreaElement | null>();
    const requestIdRef = { current: '' };

    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage: vi.fn(),
        stop,
        regenerate: vi.fn(),
        composerRef,
        requestIdRef,
      }),
    );

    result.current.handleStop();

    expect(stop).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'nothingToStop')).toBe(true);
  });

  it('awaits the override write before sending', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sendMessage = vi.fn();
    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage,
        stop: vi.fn(),
        regenerate: vi.fn(),
        composerRef: createRef<HTMLTextAreaElement | null>(),
        requestIdRef: { current: '' },
        beforeSend: () => gate,
      }),
    );
    result.current.handleSend('Hi');
    expect(sendMessage).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
  });

  it('regenerateMessage regenerates the given message with turn headers and notifies', async () => {
    const regenerate = vi.fn();
    const requestIdRef = { current: '' };

    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage: vi.fn(),
        stop: vi.fn(),
        regenerate,
        composerRef: createRef<HTMLTextAreaElement | null>(),
        requestIdRef,
      }),
    );

    result.current.regenerateMessage('m-2');

    // The notify fires immediately; the regenerate is deferred behind the (resolved) send gate.
    expect(events.some((e) => e.type === 'messageRegenerating')).toBe(true);
    await waitFor(() => expect(regenerate).toHaveBeenCalledTimes(1));
    const [arg] = regenerate.mock.calls[0] as [{ messageId?: string; headers?: unknown }];
    expect(arg.messageId).toBe('m-2');
    // beginTurn returns a header object carrying the fresh turn id; assert it was threaded through.
    expect(arg.headers).toBeDefined();
  });

  it('editMessage sends a replacement with messageId, createdAt metadata, turn headers, and notifies', async () => {
    const sendMessage = vi.fn();
    const requestIdRef = { current: '' };

    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage,
        stop: vi.fn(),
        regenerate: vi.fn(),
        composerRef: createRef<HTMLTextAreaElement | null>(),
        requestIdRef,
      }),
    );

    result.current.editMessage('m-3', 'hello');

    // The notify fires immediately; the send is deferred behind the (resolved) send gate.
    expect(events.some((e) => e.type === 'messageEdited')).toBe(true);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    const [message, options] = sendMessage.mock.calls[0] as [
      { text?: string; messageId?: string; metadata?: { createdAt?: number } },
      { headers?: unknown },
    ];
    expect(message.text).toBe('hello');
    expect(message.messageId).toBe('m-3');
    // Same metadata handleSend stamps: a fresh createdAt so the edited message reads like a normal send.
    expect(typeof message.metadata?.createdAt).toBe('number');
    // beginTurn returns a header object carrying the fresh turn id; assert it was threaded through.
    expect(options.headers).toBeDefined();
  });

  it('holds editMessage and regenerateMessage behind the send gate until beforeSend resolves', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sendMessage = vi.fn();
    const regenerate = vi.fn();

    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage,
        stop: vi.fn(),
        regenerate,
        composerRef: createRef<HTMLTextAreaElement | null>(),
        requestIdRef: { current: '' },
        beforeSend: () => gate,
      }),
    );

    // Both generation-starting actions fire while the gate is still pending: a toggle-then-act race.
    result.current.editMessage('m-9', 'edited text');
    result.current.regenerateMessage('m-9');

    // The notifies are immediate (user feedback), but NO generation has begun behind the open gate.
    expect(events.some((e) => e.type === 'messageEdited')).toBe(true);
    expect(events.some((e) => e.type === 'messageRegenerating')).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(regenerate).not.toHaveBeenCalled();

    // Resolving the gate lets both actions proceed - only now do the SDK calls fire.
    release();
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(regenerate).toHaveBeenCalledTimes(1));
    const [editArg] = sendMessage.mock.calls[0] as [{ messageId?: string }];
    expect(editArg.messageId).toBe('m-9');
  });

  it('handleRetry focuses the composer synchronously (immediately, not behind the send gate)', () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const regenerate = vi.fn();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const composerRef = { current: textarea };

    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage: vi.fn(),
        stop: vi.fn(),
        regenerate,
        composerRef,
        requestIdRef: { current: '' },
        beforeSend: () => gate,
      }),
    );

    result.current.handleRetry();

    // Focus moves immediately even though the regenerate is still held behind the open gate.
    expect(textarea).toHaveFocus();
    expect(regenerate).not.toHaveBeenCalled();

    release();
    document.body.removeChild(textarea);
  });

  it('handleStop calls stop and focuses the composer when busy', () => {
    const stop = vi.fn();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const composerRef = { current: textarea };
    const requestIdRef = { current: '' };

    const { result } = renderHook(() =>
      useChatActions({
        busy: true,
        sendMessage: vi.fn(),
        stop,
        regenerate: vi.fn(),
        composerRef,
        requestIdRef,
      }),
    );

    result.current.handleStop();

    expect(stop).toHaveBeenCalledOnce();
    expect(textarea).toHaveFocus();
    expect(events.some((e) => e.type === 'nothingToStop')).toBe(false);

    document.body.removeChild(textarea);
  });

  it('surfaces a pre-flight SDK throw: notifies messageActionFailed and reports the client error', async () => {
    // The AI SDK throws SYNCHRONOUSLY (rejecting the gate promise, never reaching useChat error state)
    // when the target message id no longer exists; the gate catch must surface, not swallow, it.
    const sendMessage = vi.fn(() => {
      throw new Error('no message with id m-x');
    });
    // The gate stamps a fresh turn id (beginTurn) before the SDK call, so the reported id is that
    // fresh id - the one that correlates with the server's chat line - not the prior ref value.
    const requestIdRef = { current: '' };

    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage,
        stop: vi.fn(),
        regenerate: vi.fn(),
        composerRef: createRef<HTMLTextAreaElement | null>(),
        requestIdRef,
      }),
    );

    result.current.editMessage('m-x', 'edited');

    await waitFor(() => expect(events.some((e) => e.type === 'messageActionFailed')).toBe(true));
    expect(reportClientError).toHaveBeenCalledTimes(1);
    const [err, id] = vi.mocked(reportClientError).mock.calls[0] as [unknown, string];
    expect(err).toBeInstanceOf(Error);
    // A fresh, non-empty turn id was stamped by the gate and threaded into the error report.
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('does not report a failure when the SDK call resolves (no false failure)', async () => {
    const sendMessage = vi.fn(() => Promise.resolve());

    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage,
        stop: vi.fn(),
        regenerate: vi.fn(),
        composerRef: createRef<HTMLTextAreaElement | null>(),
        requestIdRef: { current: '' },
      }),
    );

    result.current.handleSend('Hi');

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    // The send resolved, so neither the failure notify nor the error report fires.
    expect(events.some((e) => e.type === 'messageActionFailed')).toBe(false);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('swallows a REJECTED beforeSend for an edit or regenerate (gate never throws an unhandled rejection)', async () => {
    // A rejected gate must surface a content-safe failure, not bubble as an unhandled rejection. This
    // closes the last gap in the gate's coverage (the rejected-beforeSend branch).
    const sendMessage = vi.fn();
    const regenerate = vi.fn();
    const beforeSend = vi.fn(() => Promise.reject(new Error('gate rejected')));

    const { result } = renderHook(() =>
      useChatActions({
        busy: false,
        sendMessage,
        stop: vi.fn(),
        regenerate,
        composerRef: createRef<HTMLTextAreaElement | null>(),
        requestIdRef: { current: '' },
        beforeSend,
      }),
    );

    result.current.editMessage('m-1', 'edited');
    result.current.regenerateMessage('m-1');

    // The gate rejected before either SDK call could run; the failure is surfaced (content-safe),
    // never thrown, and the SDK was never reached.
    await waitFor(() =>
      expect(events.filter((e) => e.type === 'messageActionFailed').length).toBe(2),
    );
    expect(sendMessage).not.toHaveBeenCalled();
    expect(regenerate).not.toHaveBeenCalled();
  });
});
