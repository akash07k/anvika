import { simulateReadableStream, type UIMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

/** A single user message fixture shared by the streamChat tests. */
export const messages: UIMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
];

/** A mock model that streams a single "ok" text delta then a clean stop finish (1 in, 1 out). */
export function okModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'ok' },
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });
}

/** A mock model that streams "Hello, world!" across two deltas then a clean stop finish. */
export function helloModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'Hello' },
          { type: 'text-delta', id: 't1', delta: ', world!' },
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 3, text: 3, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });
}

/** A mock model whose `doStream` throws, to exercise the error-mapping and error-outcome paths. */
export function erroringModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => {
      throw new Error('boom');
    },
  });
}

/**
 * A mock model that streams a `text-start` and one `text-delta` ("partial"), then emits an
 * `{ type: 'error' }` stream part to fail MID-STREAM (no `finish` part). Unlike {@link erroringModel}
 * (which throws in `doStream` before any output), this exercises the error path AFTER text has
 * streamed, pinning what the SDK assembles into `onFinish`'s `messages` on a partial-then-error turn.
 * The `error` stream part is the provider-spec way to surface a mid-stream failure.
 *
 * @returns The mid-stream-erroring mock model.
 */
export function midStreamErrorModel(): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'partial' },
          { type: 'error', error: new Error('mid-stream boom') },
        ],
      }),
    }),
  });
}

/**
 * A mock model whose `doStream` records the `abortSignal` the AI SDK forwards into the model call,
 * then returns the usual short stream. Used to prove `streamChat` wires `abortSignal` into
 * `streamText` (which passes it through to `doStream`), not merely that a log line fires.
 *
 * @param captured - A box the captured signal is written into.
 * @returns The signal-capturing mock model.
 */
export function signalCapturingModel(captured: {
  signal?: AbortSignal | undefined;
}): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async (options) => {
      captured.signal = options.abortSignal;
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'ok' },
            { type: 'text-end', id: 't1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ],
        }),
      };
    },
  });
}

/**
 * A mock model that emits only total token counts (cache/reasoning sub-counts undefined so the
 * compactor omits them), for asserting content-safe usage stamping.
 *
 * @param counts - The input and output token totals to emit (totalTokens is unused by the mock).
 * @returns The usage-emitting mock model.
 */
export function usageMockModel({
  inputTokens,
  outputTokens,
}: {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'ok' },
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: inputTokens,
                noCache: inputTokens,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: outputTokens, text: outputTokens, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}
