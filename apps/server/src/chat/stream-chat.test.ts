import { describe, expect, it, vi } from 'vitest';

import type { ChatContentEntry } from './content-log';
import { serverLogger } from '../logging/logger';
import { streamChat } from './stream-chat';
import {
  erroringModel,
  helloModel,
  messages,
  okModel,
  signalCapturingModel,
} from './stream-chat.testkit';

describe('streamChat streaming, logging, and error mapping', () => {
  it('returns a streaming response carrying the model text', async () => {
    const res = await streamChat({ model: helloModel(), messages });
    expect(res).toBeInstanceOf(Response);
    const body = await res.text();
    expect(body).toContain('Hello');
    expect(body).toContain('world!');
  });

  it('logs the assistant message through the content sink when logContent is on', async () => {
    const entries: ChatContentEntry[] = [];
    const res = await streamChat({
      model: helloModel(),
      messages,
      logContent: true,
      contentSink: (entry) => entries.push(entry),
    });
    await res.text(); // consume the stream so onFinish runs
    expect(entries).toEqual([{ role: 'assistant', text: 'Hello, world!' }]);
  });

  it('does not log content when logContent is off (default)', async () => {
    const entries: ChatContentEntry[] = [];
    const res = await streamChat({
      model: helloModel(),
      messages,
      contentSink: (e) => entries.push(e),
    });
    await res.text();
    expect(entries).toHaveLength(0);
  });

  it('stamps requestId on the stream complete log line', async () => {
    const infoSpy = vi.spyOn(serverLogger('chat'), 'info');
    try {
      const res = await streamChat({ model: helloModel(), messages, requestId: 'req123' });
      await res.text();
      const calls = infoSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
      const complete = calls.find(([msg]) => msg === 'stream complete');
      expect(complete?.[1]?.requestId).toBe('req123');
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('logs an info "turn aborted" line with requestId and elapsedMs on an aborted signal', async () => {
    const infoSpy = vi.spyOn(serverLogger('chat'), 'info');
    try {
      const controller = new AbortController();
      const res = await streamChat({
        model: okModel(),
        messages,
        requestId: 'abort01',
        abortSignal: controller.signal,
      });
      controller.abort();
      await res.text();
      const calls = infoSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
      const aborted = calls.find(([msg]) => msg === 'turn aborted');
      expect(aborted).toBeDefined();
      expect(aborted?.[1]?.requestId).toBe('abort01');
      expect(typeof aborted?.[1]?.elapsedMs).toBe('number');
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('forwards the abort signal into the model call (the SDK passes it through to doStream)', async () => {
    const captured: { signal?: AbortSignal | undefined } = {};
    // A pre-aborted signal: if streamChat wires it into streamText, the SDK hands the very same
    // (already-aborted) AbortSignal to the model's doStream - proving the upstream call observes it.
    const signal = AbortSignal.abort();
    const res = await streamChat({
      model: signalCapturingModel(captured),
      messages,
      abortSignal: signal,
    });
    await res.text(); // drain so doStream has certainly been invoked
    // The model call received a defined AbortSignal (forwarding happened) and it is the aborted one.
    expect(captured.signal).toBeInstanceOf(AbortSignal);
    expect(captured.signal?.aborted).toBe(true);
    expect(captured.signal).toBe(signal);
  });

  it('maps a stream error to a content-safe category message, hiding the raw cause and the id', async () => {
    const res = await streamChat({ model: erroringModel(), messages, requestId: 'ref999' });
    const body = await res.text();
    expect(body).not.toContain('boom'); // the raw provider message never crosses the boundary
    expect(body).not.toContain('ref999'); // the id stays in the server log, not the client message
    expect(body).toMatch(/provider returned an error|failed unexpectedly/); // the mapped category
  });
});
