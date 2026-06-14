import { describe, expect, it } from 'vitest';

import { bustModelsDevCache, fetchModelsDev } from './modelsdev';

/**
 * One comprehensive test: `modelsdev.ts` holds a module-level cache shared across this file, so the
 * first populated `fetchModelsDev` is reused regardless of a later `fetchImpl`. We feed a single rich
 * catalog body and assert native mapping, the xAI alias fallback, partial fields, and misses on the
 * one returned lookup.
 */
describe('fetchModelsDev', () => {
  it('maps native + aliased providers, partial fields, and misses', async () => {
    const body = {
      anthropic: {
        models: {
          'claude-x': { cost: { input: 3, output: 15 }, limit: { context: 200000, output: 64000 } },
          'partial-only': { cost: { input: 2 } },
        },
      },
      'x-ai': {
        models: { 'grok-z': { cost: { input: 5, output: 10 }, limit: { context: 131072 } } },
      },
    };
    const lookup = await fetchModelsDev({
      fetchImpl: async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    // A native provider's model maps via toMeta.
    expect(lookup('anthropic', 'claude-x')).toEqual({
      inputPrice: 3,
      outputPrice: 15,
      contextWindow: 200000,
      maxOutputTokens: 64000,
    });

    // The xai ALIAS fallback resolves a model published only under the `x-ai` key.
    expect(lookup('xai', 'grok-z')).toEqual({
      inputPrice: 5,
      outputPrice: 10,
      contextWindow: 131072,
      maxOutputTokens: null,
    });

    // A model with only cost.input maps the rest to null.
    expect(lookup('anthropic', 'partial-only')).toEqual({
      inputPrice: 2,
      outputPrice: null,
      contextWindow: null,
      maxOutputTokens: null,
    });

    // Misses: unknown model and unknown provider both return null.
    expect(lookup('anthropic', 'no-such-model')).toBeNull();
    expect(lookup('unknownprovider', 'x')).toBeNull();
  });

  it('bustModelsDevCache forces a fresh catalog fetch', async () => {
    // Bust first to clear any value cached by the preceding test (module-level cache is shared).
    bustModelsDevCache();

    let fetches = 0;
    const fetchImpl = async (): Promise<Response> => {
      fetches += 1;
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    await fetchModelsDev({ fetchImpl });
    await fetchModelsDev({ fetchImpl }); // cached, no second fetch
    expect(fetches).toBe(1);
    bustModelsDevCache();
    await fetchModelsDev({ fetchImpl }); // busted, re-fetch
    expect(fetches).toBe(2);
  });
});
