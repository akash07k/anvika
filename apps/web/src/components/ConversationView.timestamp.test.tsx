import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnvikaUIMessage } from '../lib/message/anvikaMessage';
import {
  captured,
  mockSettings,
  readiness,
  registerConversationViewHooks,
  renderView,
  state,
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

// Reset the timestamp-format overrides this suite applies; the shared testkit only resets its own fields.
afterEach(() => {
  const ts = mockSettings as Record<string, unknown>;
  delete ts['timestampWeekday'];
  delete ts['timestampDateStyle'];
  delete ts['timestampHourCycle'];
  delete ts['timestampSeconds'];
});

describe('ConversationView timestamp format', () => {
  it('renders message timestamps per the configured format', () => {
    // Arrange: configure a non-default format in mockSettings (mutable; reset in afterEach).
    Object.assign(mockSettings, {
      timestampWeekday: false,
      timestampDateStyle: 'month-first',
      timestampHourCycle: 'h24',
      timestampSeconds: false,
    });
    // A message dated 8 Jun 2026 at 13:53:42 local time. Use a fixed UTC value that lands on
    // that local wall-clock time regardless of the test environment's TZ offset - we pin Date.now()
    // to 11 Jun 2026 (3 days later) so formatTimestamp picks the full date-and-time branch.
    const createdAt = new Date('2026-06-08T13:53:42').getTime(); // local midnight interpretation
    const msgWithCreatedAt: AnvikaUIMessage = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Hello!' }],
      metadata: { createdAt },
    };
    // The testkit state is narrowly typed for simplicity; cast through the common base.
    (state.messages as AnvikaUIMessage[]).length = 0;
    (state.messages as AnvikaUIMessage[]).push(msgWithCreatedAt);
    // Pin Date.now() to 11 Jun 2026 so the message is NOT "today" -> full date renders.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-11T12:00:00').getTime());
    try {
      renderView(<ConversationView />);
      expect(screen.getByText('June 8, 2026 at 13:53')).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
