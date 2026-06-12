import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  captured,
  events,
  mockSettings,
  readiness,
  regenerate,
  registerConversationViewHooks,
  renderView,
  sendMessage,
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

describe('ConversationView streaming and finish callbacks', () => {
  it('emits generationComplete on a clean finish and generationStopped on abort', () => {
    renderView(<ConversationView />);
    captured.options?.onFinish?.({
      isAbort: false,
      isError: false,
      message: { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Done' }] },
    });
    expect(events).toContainEqual({ type: 'generationComplete', text: 'Done', readWhole: false });

    events.length = 0;
    captured.options?.onFinish?.({
      isAbort: true,
      isError: false,
      message: { id: 'a2', role: 'assistant', parts: [] },
    });
    expect(events).toContainEqual({ type: 'generationStopped' });
  });

  it('moves focus to the completed message heading when focusOnCompletion is move', () => {
    mockSettings.focusOnCompletion = 'move';
    const { rerender } = renderView(<ConversationView />);
    // onFinish records the pending target; the focus effect runs on the next `messages` change, just
    // as in the app the completed assistant message lands in `messages` immediately after onFinish.
    captured.options?.onFinish?.({
      isAbort: false,
      isError: false,
      message: { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    });
    state.messages = [...state.messages];
    rerender(withChatProviders(<ConversationView />));
    expect(document.getElementById('message-a1')).toBe(document.activeElement);
  });

  it('moves focus to the latest response via its positional handle when its id is blank', () => {
    mockSettings.focusOnCompletion = 'move';
    // A blank-id assistant turn (a local-provider turn before the server heal lands): MessageList
    // renders its heading as `message-pos-<index>`, and focus-on-completion must resolve the same way.
    const blankIndex = state.messages.length - 1;
    state.messages[blankIndex] = {
      id: '',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello!' }],
    };
    const { rerender } = renderView(<ConversationView />);
    captured.options?.onFinish?.({
      isAbort: false,
      isError: false,
      message: state.messages[blankIndex],
    });
    state.messages = [...state.messages];
    rerender(withChatProviders(<ConversationView />));
    expect(document.getElementById(`message-pos-${blankIndex}`)).toBe(document.activeElement);
  });

  it('passes the configured assistant display name through to the message heading', () => {
    mockSettings.assistantName = 'Claude';
    renderView(<ConversationView />);
    expect(screen.getByRole('heading', { name: 'Claude' })).toBeInTheDocument();
  });
});

describe('ConversationView correlation-id headers', () => {
  it('attaches a correlation-id header to the send request', async () => {
    renderView(<ConversationView />);
    await userEvent.type(screen.getByLabelText('Message'), 'Hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello' }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-anvika-request-id': expect.any(String) }),
      }),
    );
  });

  it('attaches a correlation-id header to the Retry (regenerate) request', async () => {
    state.error = new Error('Boom');
    renderView(<ConversationView />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(regenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-anvika-request-id': expect.any(String) }),
      }),
    );
  });
});
