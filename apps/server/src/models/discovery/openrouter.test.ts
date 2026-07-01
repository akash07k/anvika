import { describe, expect, it } from 'vitest';

import { discoverOpenRouterModels } from './openrouter';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const errorFetchImpl = async () => new Response('nope', { status: 500 });
const throwingFetchImpl = async (): Promise<Response> => {
  throw new Error('fetch must not run for a keyless connection');
};

describe('discoverOpenRouterModels', () => {
  it('keeps text-output models and returns their bare slash ids (no meta when absent)', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: [
          { id: 'x/y', architecture: { output_modalities: ['text'] } },
          { id: 'img/only', architecture: { output_modalities: ['image'] } },
        ],
      });
    const models = await discoverOpenRouterModels(
      {
        id: 'or',
        label: 'OR',
        type: 'openrouter',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      },
      { fetchImpl },
    );
    expect(models).toEqual([{ id: 'x/y' }]);
  });

  it('attaches converted USD-per-million pricing and context as meta', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: [
          {
            id: 'openai/gpt-4',
            architecture: { output_modalities: ['text'] },
            pricing: { prompt: '0.00003', completion: '0.00006' },
            context_length: 8192,
            top_provider: { max_completion_tokens: 4096 },
          },
        ],
      });
    const models = await discoverOpenRouterModels(
      {
        id: 'or',
        label: 'OR',
        type: 'openrouter',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      },
      { fetchImpl },
    );
    expect(models).toEqual([
      {
        id: 'openai/gpt-4',
        meta: {
          inputPrice: 30,
          outputPrice: 60,
          contextWindow: 8192,
          maxOutputTokens: 4096,
        },
      },
    ]);
  });

  it('omits meta when pricing strings are empty or non-numeric', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: [{ id: 'a/b', pricing: { prompt: '', completion: 'x' } }],
      });
    const models = await discoverOpenRouterModels(
      {
        id: 'or',
        label: 'OR',
        type: 'openrouter',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      },
      { fetchImpl },
    );
    expect(models).toEqual([{ id: 'a/b' }]);
  });

  it('keeps a model whose context/output counts are 0 (field null, model not dropped)', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: [
          {
            id: 'zero/ctx',
            pricing: { prompt: '0.00003', completion: '0.00006' },
            context_length: 0,
            top_provider: { max_completion_tokens: 0 },
          },
        ],
      });
    const models = await discoverOpenRouterModels(
      {
        id: 'or',
        label: 'OR',
        type: 'openrouter',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      },
      { fetchImpl },
    );
    expect(models).toEqual([
      {
        id: 'zero/ctx',
        meta: {
          inputPrice: 30,
          outputPrice: 60,
          contextWindow: null,
          maxOutputTokens: null,
        },
      },
    ]);
  });

  it('returns [] on a non-200 or bad shape (fail-soft)', async () => {
    expect(
      await discoverOpenRouterModels(
        {
          id: 'or',
          label: 'OR',
          type: 'openrouter',
          reasoningEffort: 'inherit',
          enabled: true,
          apiKey: 'k',
        },
        { fetchImpl: errorFetchImpl },
      ),
    ).toEqual([]);
  });

  it('returns [] without fetching when the connection carries no apiKey', async () => {
    const models = await discoverOpenRouterModels(
      { id: 'or', label: 'OR', type: 'openrouter', reasoningEffort: 'inherit', enabled: true },
      { fetchImpl: throwingFetchImpl },
    );
    expect(models).toEqual([]);
  });
});
