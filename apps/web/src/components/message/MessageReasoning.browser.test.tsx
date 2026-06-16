import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { MessageReasoning } from './MessageReasoning';

/** An assistant message carrying the given reasoning text plus optional metadata. */
function reasoningMessage(
  reasoning: string,
  metadata?: AnvikaUIMessage['metadata'],
): AnvikaUIMessage {
  return {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: reasoning },
      { type: 'text', text: 'the answer' },
    ],
    metadata,
  } as AnvikaUIMessage;
}

test('renders nothing when the message has no reasoning parts', async () => {
  const message = {
    id: 'a1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'no thinking here' }],
  } as AnvikaUIMessage;
  const { container } = await render(
    <MessageReasoning message={message} busy={false} domId="a1" />,
  );
  expect(container.innerHTML).toBe('');
});

test('renders a collapsed Thinking disclosure with a heading-nav h3', async () => {
  await render(
    <MessageReasoning message={reasoningMessage('I reason carefully.')} busy={false} domId="a1" />,
  );
  const heading = document.querySelector('h3');
  expect(heading?.textContent).toContain('Thinking');
  const summary = document.querySelector('summary');
  expect(summary?.id).toBe('thinking-a1');
  const details = heading?.closest('details');
  expect(details).not.toBeNull();
  expect(details?.hasAttribute('open')).toBe(false);
  // Focus contract for the Alt+R jumpToThinking target: the summary is natively focusable,
  // so focusing its id works without tabIndex and it stays in the Tab order.
  summary?.focus();
  expect(document.activeElement).toBe(summary);
});

test('summarises the reasoning token count and duration when both are present', async () => {
  await render(
    <MessageReasoning
      message={reasoningMessage('thinking', {
        createdAt: 1,
        reasoningMs: 8200,
        usage: { tokens: { reasoning: 320 } },
      })}
      busy={false}
      domId="a1"
    />,
  );
  expect(document.querySelector('h3')?.textContent).toContain('Thinking, 320 tokens, 8 seconds');
});

test('uses a bare "Thinking" cue when neither tokens nor duration are known', async () => {
  await render(<MessageReasoning message={reasoningMessage('thinking')} busy={false} domId="a1" />);
  expect(document.querySelector('h3')?.textContent).toBe('Thinking');
});

test('renders the reasoning text and a dedicated Copy button', async () => {
  await render(
    <MessageReasoning message={reasoningMessage('I reason carefully.')} busy={false} domId="a1" />,
  );
  expect(document.body.textContent).toContain('I reason carefully.');
  const copy = document.querySelector('button[aria-label="Copy thinking"]');
  expect(copy).not.toBeNull();
});
