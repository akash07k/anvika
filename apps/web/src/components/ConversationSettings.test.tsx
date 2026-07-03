/**
 * jsdom unit tests for ConversationSettings and the ConversationView title H1.
 *
 * ConversationSettings is tested with stub model/reasoning props and mocked
 * useModels/useConnectionStatuses, mirroring the ModelSection.test.tsx pattern.
 * The H1 title is tested via ConversationView with minimal mocks.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

import type { ConversationModel } from '../hooks/conversation/useConversationModel';
import type { ConversationReasoning } from '../hooks/conversation/useConversationReasoning';
import {
  mockSettings,
  readiness,
  registerConversationViewHooks,
  renderView,
} from './ConversationView.testkit';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('../hooks/conversation/useModels', () => ({
  useModels: () => ({ data: [], isPending: false }),
  useConnectionStatuses: () => ({ data: [] }),
}));

vi.mock('../lib/conversation/conversationQueries', async () => {
  const actual = await vi.importActual<typeof import('../lib/conversation/conversationQueries')>(
    '../lib/conversation/conversationQueries',
  );
  return {
    ...actual,
    useConversationDetail: () => ({ data: undefined }),
    useBaseRevision: () => undefined,
  };
});

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    stop: vi.fn(),
    regenerate: vi.fn(),
    status: 'ready',
    error: undefined,
  }),
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

vi.mock('../hooks/conversation/useConversationReasoning', () => ({
  useConversationReasoning: () => ({
    override: 'inherit',
    capable: false,
    onEffortChange: vi.fn(),
    beforeSend: () => Promise.resolve(),
    onToggleThinking: vi.fn(),
  }),
}));

vi.mock('../hooks/conversation/useConversationModel', () => ({
  useConversationModel: () => ({
    modelId: null,
    // Honor the Promise<boolean> contract (a bare vi.fn() resolves undefined, so a future handler
    // call would throw on `.then`).
    onModelChange: vi.fn(() => Promise.resolve(true)),
    beforeSend: () => Promise.resolve(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { ConversationView } from './ConversationView';
import { ConversationSettings } from './ConversationSettings';

registerConversationViewHooks();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(overrides?: Partial<ConversationModel>): ConversationModel {
  return {
    modelId: null,
    // Resolve true so the Promise<boolean> contract holds if a handler ever invokes it.
    onModelChange: vi.fn(() => Promise.resolve(true)),
    beforeSend: () => Promise.resolve(),
    ...overrides,
  };
}

function makeReasoning(overrides?: Partial<ConversationReasoning>): ConversationReasoning {
  return {
    override: 'inherit',
    capable: false,
    onEffortChange: vi.fn(),
    beforeSend: () => Promise.resolve(),
    onToggleThinking: vi.fn(),
    ...overrides,
  };
}

function renderSettings(model: ConversationModel, reasoning: ConversationReasoning) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={qc}>
      <HotkeysProvider initiallyActiveScopes={['*']}>
        <ConversationSettings model={model} reasoning={reasoning} />
      </HotkeysProvider>
    </QueryClientProvider>
  );
  return render(ui);
}

// ---------------------------------------------------------------------------
// H1 title tests (via ConversationView)
// ---------------------------------------------------------------------------

describe('ConversationView title H1', () => {
  it('shows the passed title as the H1', () => {
    renderView(<ConversationView conversationId="abc" title="My first chat" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My first chat');
  });

  it('shows "New conversation" when title is null', () => {
    renderView(<ConversationView conversationId="abc" title={null} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New conversation');
  });

  it('shows "New conversation" when title is an empty string', () => {
    renderView(<ConversationView conversationId="abc" title="" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New conversation');
  });

  it('shows "New conversation" when title prop is absent', () => {
    renderView(<ConversationView conversationId="abc" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New conversation');
  });
});

// ---------------------------------------------------------------------------
// ConversationSettings region tests
// ---------------------------------------------------------------------------

describe('ConversationSettings', () => {
  it('renders a labelled "Conversation settings" region', () => {
    renderSettings(makeModel(), makeReasoning());
    expect(screen.getByRole('region', { name: 'Conversation settings' })).toBeInTheDocument();
  });

  it('renders the Model picker with an accessible name', () => {
    renderSettings(makeModel(), makeReasoning());
    // The combobox trigger is a Button with aria-labelledby pointing at the field label + trigger.
    // getByRole('button') with partial name match covers both label and trigger text.
    expect(screen.getByRole('button', { name: /model/i })).toBeInTheDocument();
  });

  it('renders the "Advanced settings" accordion trigger collapsed by default', () => {
    renderSettings(makeModel(), makeReasoning());
    const trigger = screen.getByRole('button', { name: 'Advanced settings' });
    expect(trigger).toBeInTheDocument();
    // Radix Accordion sets aria-expanded=false when collapsed.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('does NOT mount the Thinking effort control while the accordion is collapsed', () => {
    renderSettings(makeModel(), makeReasoning());
    expect(screen.queryByRole('combobox', { name: 'Thinking effort' })).not.toBeInTheDocument();
  });

  it('renders the Model picker without throwing', () => {
    // The real picker interaction (popover open, item select, onModelChange call, notification
    // fire) is covered by ConversationSettings.browser.test.tsx where the Radix Popover works
    // in a real browser environment. Here we assert the region renders cleanly.
    const model = makeModel({ onModelChange: vi.fn() });
    expect(() => renderSettings(model, makeReasoning())).not.toThrow();
    expect(screen.getByRole('button', { name: /model/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ConversationSettings model-change notification test (direct handler test)
// ---------------------------------------------------------------------------

describe('ConversationSettings model picker value', () => {
  it('shows "Use default model" on the trigger when the override is null (inheriting)', () => {
    // modelId null => the field value is the USE_DEFAULT sentinel => the trigger renders the
    // "Use default model" label, so a screen-reader user hears the inherit state on the collapsed
    // trigger. (The popover-open USE_DEFAULT => onModelChange(null) mapping is covered by the browser
    // test, which needs a real Radix Popover.)
    renderSettings(makeModel({ modelId: null }), makeReasoning());
    // jsdom's accessible-name computation drops the trigger's self-referenced text, so assert on the
    // visible trigger label text directly (the real accessible name is checked in the browser test).
    expect(screen.getByText('Use default model')).toBeInTheDocument();
  });

  it('shows the concrete model label on the trigger when an override is set', () => {
    // A non-null override with no matching model in the (empty) list falls back to the raw id, which
    // is still a content-safe model label (never a title or message text).
    renderSettings(makeModel({ modelId: 'openai:gpt-4o' }), makeReasoning());
    expect(screen.getByText(/openai:gpt-4o/)).toBeInTheDocument();
  });
});
