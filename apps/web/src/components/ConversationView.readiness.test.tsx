import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithRouter } from '../test/renderWithRouter';
import {
  captured,
  mockSettings,
  readiness,
  registerConversationViewHooks,
  renderView,
  state,
  withChatProviders,
} from './ConversationView.testkit';

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: unknown) => {
    captured.options = options as { onFinish?: (e: unknown) => void };
    return state;
  },
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

// ConversationSettings calls useModels and useConnectionStatuses; stub both with empty data so
// the settings region renders without a real query layer.
vi.mock('../hooks/conversation/useModels', () => ({
  useModels: () => ({ data: [], isPending: false }),
  useConnectionStatuses: () => ({ data: [] }),
}));

vi.mock('../hooks/conversation/useConversationReasoning', () => ({
  useConversationReasoning: () => ({
    override: 'inherit',
    capable: false,
    onEffortChange: vi.fn(),
    beforeSend: () => Promise.resolve(),
    onToggleThinking: vi.fn(),
  }),
}));

import { ConversationView } from './ConversationView';

registerConversationViewHooks();

describe('ConversationView readiness states', () => {
  it('shows the WelcomePanel and no composer when unconfigured', async () => {
    readiness.value = 'unconfigured';
    // WelcomePanel contains a <Link>, so a router context is required.
    renderWithRouter(withChatProviders(<ConversationView />));
    expect(
      await screen.findByRole('heading', { level: 1, name: /welcome to anvika/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.queryByLabelText('Message')).toBeNull();
  });

  it('keeps the conversation but disables Send and shows a notice when the model is unavailable', async () => {
    readiness.value = 'model-unavailable';
    renderWithRouter(withChatProviders(<ConversationView />));
    // Router renders async; await the first query before using synchronous getBy*.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'New conversation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/isn't available right now/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('enables Send when ready', () => {
    readiness.value = 'ready';
    // The ready state renders no <Link>, so a synchronous renderView (no router) suffices and lets
    // the Send button be queried immediately, as in the pre-split test.
    renderView(<ConversationView />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});
