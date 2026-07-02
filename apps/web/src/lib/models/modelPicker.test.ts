import { describe, expect, it } from 'vitest';

import type { ModelInfo } from '@anvika/shared/models/model-info';

import {
  connectionsInModels,
  filterModels,
  matchCountCue,
  matchesModelQuery,
  modelsForFilter,
  selectedModelLabel,
} from './modelPicker';

function model(
  connectionId: string,
  connectionLabel: string,
  modelName: string,
  displayName: string,
  providerId: ModelInfo['providerId'] = 'openai-compatible',
): ModelInfo {
  return {
    id: `${connectionId}:${modelName}`,
    providerId,
    connectionId,
    connectionLabel,
    displayName,
    contextWindow: null,
    maxOutputTokens: null,
    inputPrice: null,
    outputPrice: null,
    capabilities: { text: true, reasoning: false },
  };
}

const MODELS: ModelInfo[] = [
  model('conn-a', 'Anthropic Work', 'claude-x', 'Claude X', 'anthropic'),
  model('conn-b', 'Venice', 'llama-z', 'llama-z'),
  model('conn-a', 'Anthropic Work', 'claude-y', 'Claude Y', 'anthropic'),
  model('conn-b', 'Venice', 'mistral-q', 'Mistral Q'),
];

describe('connectionsInModels', () => {
  it('returns distinct connections in first-seen order', () => {
    expect(connectionsInModels(MODELS)).toEqual([
      { id: 'conn-a', label: 'Anthropic Work' },
      { id: 'conn-b', label: 'Venice' },
    ]);
  });

  it('returns an empty array for no models', () => {
    expect(connectionsInModels([])).toEqual([]);
  });
});

describe('modelsForFilter', () => {
  it("returns all models for 'all'", () => {
    expect(modelsForFilter('all', MODELS)).toHaveLength(4);
  });

  it('narrows to a single connection', () => {
    const result = modelsForFilter('conn-b', MODELS);
    expect(result.map((m) => m.id)).toEqual(['conn-b:llama-z', 'conn-b:mistral-q']);
  });

  it('returns an empty array for an unknown connection', () => {
    expect(modelsForFilter('conn-z', MODELS)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Helpers for the combobox model picker
// ---------------------------------------------------------------------------

function comboModel(partial: Partial<ModelInfo>): ModelInfo {
  return {
    id: 'openai:gpt-4o',
    providerId: 'openai',
    connectionId: 'openai',
    connectionLabel: 'OpenAI',
    displayName: 'GPT-4o',
    contextWindow: null,
    maxOutputTokens: null,
    inputPrice: null,
    outputPrice: null,
    capabilities: { text: true, reasoning: false },
    ...partial,
  };
}

const comboA = comboModel({ id: 'openai:gpt-4o', connectionId: 'openai', displayName: 'GPT-4o' });
const comboB = comboModel({
  id: 'anthropic:sonnet',
  connectionId: 'anthropic',
  connectionLabel: 'Anthropic',
  providerId: 'anthropic',
  displayName: 'Claude Sonnet',
});

describe('matchesModelQuery', () => {
  it('matches an empty query', () => {
    expect(matchesModelQuery(comboB, '')).toBe(true);
  });
  it('matches display name, connection label, and provider id, case-insensitively', () => {
    expect(matchesModelQuery(comboB, 'sonnet')).toBe(true);
    expect(matchesModelQuery(comboB, 'ANTHRO')).toBe(true);
    expect(matchesModelQuery(comboB, 'anthropic')).toBe(true);
  });
  it('does not match unrelated text', () => {
    expect(matchesModelQuery(comboB, 'gemini')).toBe(false);
  });
});

describe('filterModels', () => {
  it('filters by scope then by query', () => {
    expect(filterModels([comboA, comboB], 'all', '')).toEqual([comboA, comboB]);
    expect(filterModels([comboA, comboB], 'anthropic', '')).toEqual([comboB]);
    expect(filterModels([comboA, comboB], 'all', 'gpt')).toEqual([comboA]);
    expect(filterModels([comboA, comboB], 'anthropic', 'gpt')).toEqual([]);
  });
});

describe('selectedModelLabel', () => {
  it('prompts when nothing is selected', () => {
    expect(selectedModelLabel('', [comboA])).toBe('Select a model');
  });
  it('shows the model name with its connection when available', () => {
    expect(selectedModelLabel('openai:gpt-4o', [comboA])).toBe('GPT-4o (OpenAI)');
  });
  it('shows the raw id with an unavailable cue when not in the list', () => {
    expect(selectedModelLabel('zzz:ghost', [comboA])).toBe('zzz:ghost (currently unavailable)');
  });
});

describe('matchCountCue', () => {
  const connections = [{ id: 'openai', label: 'OpenAI' }];
  it('pluralizes and notes the scope', () => {
    expect(matchCountCue(1, 'all', connections)).toBe('1 model');
    expect(matchCountCue(3, 'all', connections)).toBe('3 models');
    expect(matchCountCue(2, 'openai', connections)).toBe('2 models from OpenAI');
  });
  it('omits the connection clause when the scoped connection is absent', () => {
    expect(matchCountCue(2, 'ghost', [{ id: 'openai', label: 'OpenAI' }])).toBe('2 models');
  });
});
