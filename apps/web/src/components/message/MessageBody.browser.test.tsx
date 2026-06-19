import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import { MessageBody } from './MessageBody';
import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';

const assistant = (text: string): AnvikaUIMessage =>
  ({ id: 'a1', role: 'assistant', parts: [{ type: 'text', text }] }) as AnvikaUIMessage;

test('markdown renders as semantic HTML with headings offset under the message h2', async () => {
  await render(
    <MessageBody message={assistant('# Title\n\n## Section\n\n- one\n- two')} busy={false} />,
  );
  expect(document.querySelector('h3')?.textContent).toContain('Title');
  expect(document.querySelector('h4')?.textContent).toContain('Section');
  expect(document.querySelector('h1, h2')).toBeNull();
  expect(document.querySelectorAll('li')).toHaveLength(2);
});

test('markdown h5/h6 overflow past h6 use role=heading with aria-level 7/8', async () => {
  await render(<MessageBody message={assistant('##### deep\n\n###### deeper')} busy={false} />);
  expect(document.querySelector('[role="heading"][aria-level="7"]')?.textContent).toContain('deep');
  expect(document.querySelector('[role="heading"][aria-level="8"]')?.textContent).toContain(
    'deeper',
  );
});

test('an unterminated code fence does not render a raw fence', async () => {
  await render(<MessageBody message={assistant('text\n\n```ts\nconst x = 1')} busy={true} />);
  expect(document.querySelector('pre, code')).not.toBeNull();
  expect(document.body.textContent).not.toContain('```');
});

test('raw HTML in model output is not rendered as elements', async () => {
  await render(<MessageBody message={assistant('hi <img src=x onerror=alert(1)>')} busy={false} />);
  expect(document.querySelector('img')).toBeNull();
});

test('external links open in a new tab with a safe rel', async () => {
  await render(<MessageBody message={assistant('[site](https://example.com)')} busy={false} />);
  const a = document.querySelector('a');
  expect(a?.getAttribute('target')).toBe('_blank');
  expect(a?.getAttribute('rel')).toContain('noopener');
});

test('a user message renders as plain text, not markdown', async () => {
  const user = {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: '# not a heading' }],
  } as AnvikaUIMessage;
  await render(<MessageBody message={user} busy={false} />);
  expect(document.querySelector('h1, h2, h3')).toBeNull();
  expect(document.body.textContent).toContain('# not a heading');
});
