import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { useSettingsStore } from '../../stores/settingsStore';
import { MessageUsageDetails } from './MessageUsageDetails';
import { settings } from '../settings/SettingsForm.testkit';

afterEach(() => {
  useSettingsStore.setState({ settings: null });
});

function assistantWith(metadata: AnvikaUIMessage['metadata']): AnvikaUIMessage {
  return {
    id: 'a1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'hi' }],
    metadata,
  } as AnvikaUIMessage;
}

/** An assistant message whose metadata.usage is the given partial usage object. */
function messageWithUsage(
  usage: NonNullable<AnvikaUIMessage['metadata']>['usage'],
): AnvikaUIMessage {
  return assistantWith({ createdAt: 1, usage });
}

describe('MessageUsageDetails', () => {
  it('renders a collapsed disclosure summarising total tokens, with a labelled breakdown', () => {
    const msg = assistantWith({
      createdAt: 1,
      usage: {
        tokens: { input: 100, output: 50, total: 150, reasoning: 10 },
        finishReason: 'stop',
        modelId: 'openai:gpt-4o',
        price: { input: 2.5, output: 10, currency: 'USD' },
      },
    });
    render(<MessageUsageDetails message={msg} />);
    expect(screen.getByText('Usage: 150 tokens')).toBeInTheDocument();
    expect(screen.getByText('Input tokens: 100')).toBeInTheDocument();
    expect(screen.getByText('Output tokens: 50')).toBeInTheDocument();
    expect(screen.getByText('Reasoning tokens: 10')).toBeInTheDocument();
    expect(screen.getByText('Model: gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('Finish reason: stop')).toBeInTheDocument();
    expect(screen.getByText(/estimated USD/)).toBeInTheDocument();
  });

  it('omits the cost line when unpriced (e.g. Azure/local)', () => {
    const msg = assistantWith({
      createdAt: 1,
      usage: { tokens: { input: 5, output: 7, total: 12 }, modelId: 'azure:DeepSeek-V4-Flash' },
    });
    render(<MessageUsageDetails message={msg} />);
    expect(screen.getByText('Usage: 12 tokens')).toBeInTheDocument();
    expect(screen.queryByText(/estimated USD/)).toBeNull();
  });

  it('derives the summary total from input+output when the provider omits total', () => {
    const msg = assistantWith({
      createdAt: 1,
      usage: { tokens: { input: 40, output: 60 }, modelId: 'openai:gpt-4o' },
    });
    render(<MessageUsageDetails message={msg} />);
    expect(screen.getByText('Usage: 100 tokens')).toBeInTheDocument();
    expect(screen.getByText('Total tokens: 100')).toBeInTheDocument();
  });

  it('renders nothing when the message has no usage block', () => {
    const msg = assistantWith({ createdAt: 1 });
    const { container } = render(<MessageUsageDetails message={msg} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks an aborted turn as stopped in the summary and outcome line', () => {
    render(
      <MessageUsageDetails
        message={messageWithUsage({ incompleteReason: 'aborted', tokens: { total: 12 } })}
      />,
    );
    expect(screen.getByText('Usage (stopped): 12 tokens')).toBeInTheDocument();
    expect(screen.getByText('Outcome: Stopped before completion')).toBeInTheDocument();
  });

  it('marks an errored turn with no tokens as just "Usage (error)"', () => {
    render(<MessageUsageDetails message={messageWithUsage({ incompleteReason: 'error' })} />);
    expect(screen.getByText('Usage (error)')).toBeInTheDocument();
    expect(screen.getByText('Outcome: Ended with an error')).toBeInTheDocument();
  });

  it('renders the cost in the store-selected currency', () => {
    useSettingsStore.setState({ settings: settings({ currency: 'INR', inrPerUsd: 95.11 }) });
    render(
      <MessageUsageDetails
        message={messageWithUsage({
          tokens: { input: 1000, output: 1000 },
          price: { input: 3, output: 15, currency: 'USD' },
        })}
      />,
    );
    expect(screen.getByText('Cost: estimated INR 1.712')).toBeInTheDocument();
  });
});
