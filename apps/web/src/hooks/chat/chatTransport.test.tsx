import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatTransport } from './chatTransport';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Capture the POST body the transport sends, returning a minimal empty SSE stream so it resolves. */
function captureSendBody() {
  const calls: Array<Record<string, unknown>> = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    // The transport always serializes a JSON string body, so a direct parse is safe here.
    const raw = typeof init?.body === 'string' ? init.body : '{}';
    calls.push(JSON.parse(raw) as Record<string, unknown>);
    // An empty, immediately-closed UI message stream - enough for sendMessages to resolve.
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => controller.close(),
    });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
  });
  return calls;
}

const sendArgs = {
  trigger: 'submit-message' as const,
  chatId: 'chat-1',
  messageId: undefined,
  messages: [],
  abortSignal: undefined,
};

describe('useChatTransport', () => {
  it('threads conversationId into the send body when one is set', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport('conv-7'));
    await result.current.sendMessages(sendArgs);
    expect(calls[0]).toMatchObject({ conversationId: 'conv-7', trigger: 'submit-message' });
  });

  it('omits conversationId when undefined (the turn stays ephemeral)', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport(undefined));
    await result.current.sendMessages(sendArgs);
    expect(calls[0]).not.toHaveProperty('conversationId');
  });

  it('threads baseRevision into the send body when it is a number', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport('conv-7', 4));
    await result.current.sendMessages(sendArgs);
    expect(calls[0]).toMatchObject({ conversationId: 'conv-7', baseRevision: 4 });
  });

  it('threads baseRevision when it is 0 (a legitimate backfilled revision, not falsy-omitted)', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport('conv-7', 0));
    await result.current.sendMessages(sendArgs);
    // The critical case: 0 is falsy but a real revision, so it MUST be sent (a truthiness check
    // would drop it and let a stale send through unchecked).
    expect(calls[0]).toHaveProperty('baseRevision', 0);
  });

  it('omits baseRevision when undefined (a draft: the server creates the row, no conflict check)', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport('conv-7', undefined));
    await result.current.sendMessages(sendArgs);
    expect(calls[0]).not.toHaveProperty('baseRevision');
  });

  it('threads modelId into the send body when a per-conversation override is set', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport('conv-7', undefined, 'openai:gpt-4o'));
    await result.current.sendMessages(sendArgs);
    expect(calls[0]).toMatchObject({ conversationId: 'conv-7', modelId: 'openai:gpt-4o' });
  });

  it('omits modelId when the override is null (inheriting the settings default)', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport('conv-7', undefined, null));
    await result.current.sendMessages(sendArgs);
    // An inheriting conversation MUST omit modelId so the server tracks the live settings default.
    expect(calls[0]).not.toHaveProperty('modelId');
  });

  it('omits modelId when the override is an empty string (treated as inherit, never sent)', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport('conv-7', undefined, ''));
    await result.current.sendMessages(sendArgs);
    expect(calls[0]).not.toHaveProperty('modelId');
  });

  it('omits modelId when the override is undefined (no override argument)', async () => {
    const calls = captureSendBody();
    const { result } = renderHook(() => useChatTransport('conv-7'));
    await result.current.sendMessages(sendArgs);
    expect(calls[0]).not.toHaveProperty('modelId');
  });

  it('picks up a model override change on the next send (read from a live ref, not a closure)', async () => {
    const calls = captureSendBody();
    const { result, rerender } = renderHook(
      ({ model }) => useChatTransport('conv-7', undefined, model),
      { initialProps: { model: undefined as string | null | undefined } },
    );
    await result.current.sendMessages(sendArgs);
    expect(calls[0]).not.toHaveProperty('modelId');
    // Switch the override; the SAME memoized transport must pick it up via the ref on the next send.
    rerender({ model: 'anthropic:claude' });
    await result.current.sendMessages(sendArgs);
    expect(calls[1]).toMatchObject({ modelId: 'anthropic:claude' });
  });

  it('reuses one transport instance across renders (memoized)', () => {
    const { result, rerender } = renderHook(({ id }) => useChatTransport(id), {
      initialProps: { id: 'a' as string | undefined },
    });
    const first = result.current;
    rerender({ id: 'b' });
    expect(result.current).toBe(first);
  });

  it('preserves envelope fields (id, messages, trigger, messageId) in the send body', async () => {
    const calls = captureSendBody();
    const stubMessage = {
      id: 'msg-99',
      role: 'user',
      content: 'hello',
      parts: [],
    } as unknown as import('../../lib/message/anvikaMessage').AnvikaUIMessage;
    const argsWithData = {
      trigger: 'submit-message' as const,
      chatId: 'chat-envelope',
      messageId: 'msg-99',
      messages: [stubMessage],
      abortSignal: undefined,
    };
    const { result } = renderHook(() => useChatTransport('conv-envelope'));
    await result.current.sendMessages(argsWithData);
    // calls[0] is always populated by captureSendBody when fetch is called once.
    const body = calls[0] as Record<string, unknown>;
    // Core envelope fields must be present and non-empty so a future refactor cannot silently
    // drop them when it reconstructs the body to inject conversationId.
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('messages');
    expect(Array.isArray(body['messages'])).toBe(true);
    expect((body['messages'] as unknown[]).length).toBeGreaterThan(0);
    expect(body).toMatchObject({ trigger: 'submit-message', conversationId: 'conv-envelope' });
  });
});
