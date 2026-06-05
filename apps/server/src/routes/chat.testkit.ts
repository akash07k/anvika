import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { Hono } from 'hono';

import { SettingsSchema } from '@anvika/shared/settings/schema';

import type { ChatContentEntry } from '../chat/content-log';
import { createChatRoute } from './chat';

/** A minimal valid chat request body: one user message with createdAt metadata. */
export const validBody = {
  messages: [
    {
      id: 'm1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hi' }],
      metadata: { createdAt: 1700000000000 },
    },
  ],
};

/** The resolver result shape: a mock model that streams "ok", plus a resolved id and parsed settings. */
export function okModel() {
  return {
    model: new MockLanguageModelV3({
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
    }),
    resolvedModelId: 'test:model',
    settings: SettingsSchema.parse({}),
  };
}

/** Build an app whose chat route pushes content entries into `entries` when `logContent` is on. */
export function appWithSink(entries: ChatContentEntry[], logContent: boolean): Hono {
  const app = new Hono();
  app.route(
    '/',
    createChatRoute({
      resolveModel: okModel,
      logContent,
      contentSink: (entry) => entries.push(entry),
    }),
  );
  return app;
}

/** Build an app whose chat route resolves the {@link okModel} mock. */
export function appWithMock(): Hono {
  const app = new Hono();
  app.route('/', createChatRoute({ resolveModel: okModel }));
  return app;
}

/** POST `body` as JSON to `/api/v1/chat` on `app`. */
export function post(app: Hono, body: unknown): Response | Promise<Response> {
  return app.request('/api/v1/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
