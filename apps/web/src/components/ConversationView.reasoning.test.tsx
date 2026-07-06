import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

import * as apiClient from '../lib/api-client';
import {
  mockSettings,
  readiness,
  registerConversationViewHooks,
  renderView,
  state,
} from './ConversationView.testkit';

const ID = 'xyz-789';

// ---------------------------------------------------------------------------
// Query-hook stubs: the real useConversationReasoning is exercised; these two
// mocks stand in for the TanStack queries it delegates to.
// ---------------------------------------------------------------------------

let detailData: { messages: unknown[]; reasoningOverride: ReasoningEffort | null } | undefined = {
  messages: [],
  reasoningOverride: 'low',
};
let modelsData: { id: string; capabilities: { text: boolean; reasoning: boolean } }[] = [];

vi.mock('../lib/conversation/conversationQueries', async () => {
  const actual = await vi.importActual<typeof import('../lib/conversation/conversationQueries')>(
    '../lib/conversation/conversationQueries',
  );
  return {
    ...actual,
    useConversationDetail: () => ({ data: detailData }),
  };
});

vi.mock('../hooks/conversation/useModels', () => ({
  useModels: () => ({ data: modelsData, isPending: false }),
  // ConversationSettings also calls useConnectionStatuses; stub with empty data.
  useConnectionStatuses: () => ({ data: [] }),
}));

// ---------------------------------------------------------------------------
// Standard ConversationView sibling mocks. The QueryClient provider from the
// testkit is still present (useChatConflict/useBaseRevision use useQueryClient).
// ---------------------------------------------------------------------------

vi.mock('@ai-sdk/react', () => ({
  useChat: () => state,
}));

vi.mock('../diagnostics/reportClientError', () => ({ reportClientError: vi.fn() }));

vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ status: 'ready', settings: mockSettings, hydrate: vi.fn() }),
}));

vi.mock('../hooks/chat/useChatReadiness', () => ({
  useChatReadiness: () => readiness.value,
}));

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

// NOTE: useConversationReasoning is NOT mocked here; the real implementation runs so
// the wire from detail data -> control -> id-scoped 204 PATCH -> spy is exercised end-to-end.

import { ConversationView } from './ConversationView';

registerConversationViewHooks();

// ---------------------------------------------------------------------------
// Local reset: detailData, modelsData, and selectedModelId between tests.
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSettings.selectedModelId = 'conn:model';
  detailData = { messages: [], reasoningOverride: 'low' };
  modelsData = [{ id: 'conn:model', capabilities: { text: true, reasoning: true } }];
  vi.spyOn(apiClient, 'apiPatchNoContent').mockResolvedValue(undefined);
});

afterEach(() => {
  mockSettings.selectedModelId = '';
  detailData = { messages: [], reasoningOverride: 'low' };
  modelsData = [];
  vi.restoreAllMocks();
});

// The thinking-effort control lives inside the "Advanced settings" accordion, which is collapsed
// by default (Radix Accordion unmounts collapsed content). Each test expands the accordion first
// before querying or interacting with the control.
describe('ConversationView reasoning control', () => {
  it('renders the thinking-effort control reflecting the loaded override', async () => {
    detailData = { messages: [], reasoningOverride: 'low' };
    renderView(<ConversationView conversationId={ID} />);
    await userEvent.click(screen.getByRole('button', { name: 'Advanced settings' }));
    const select = screen.getByRole('combobox', { name: 'Thinking effort' });
    expect(select).toBeEnabled();
    expect(select).toHaveValue('low');
  });

  it('disables the control when the active model cannot reason', async () => {
    modelsData = [{ id: 'conn:model', capabilities: { text: true, reasoning: false } }];
    renderView(<ConversationView conversationId={ID} />);
    await userEvent.click(screen.getByRole('button', { name: 'Advanced settings' }));
    expect(screen.getByRole('combobox', { name: 'Thinking effort' })).toBeDisabled();
  });

  it('choosing off persists the override via an id-scoped 204 PATCH', async () => {
    renderView(<ConversationView conversationId={ID} />);
    await userEvent.click(screen.getByRole('button', { name: 'Advanced settings' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Thinking effort' }), 'off');
    expect(vi.mocked(apiClient.apiPatchNoContent)).toHaveBeenCalledWith(
      `/api/v1/conversations/${ID}/reasoning`,
      { reasoningOverride: 'off' },
    );
  });
});
