import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MessageList } from './MessageList';
import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { DEFAULT_TIMESTAMP_OPTIONS } from '../../lib/format/timestampOptions';

const messages: AnvikaUIMessage[] = [
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
];

/** Factory for a blank-id message used in the stable-dom-handle test. */
const blankMessage = (role: 'user' | 'assistant'): AnvikaUIMessage =>
  ({ id: '', role, parts: [{ type: 'text', text: role }] }) as unknown as AnvikaUIMessage;

describe('MessageList', () => {
  it('marks the log busy while generating', () => {
    const { rerender } = render(<MessageList messages={messages} busy={true} />);
    expect(screen.getByRole('list', { name: 'Messages' })).toHaveAttribute('aria-busy', 'true');
    rerender(<MessageList messages={messages} busy={false} />);
    expect(screen.getByRole('list', { name: 'Messages' })).toHaveAttribute('aria-busy', 'false');
  });

  it('gives each message heading a stable id and makes it programmatically focusable', () => {
    render(<MessageList messages={messages} busy={false} />);
    const heading = screen.getByRole('heading', { name: 'Assistant' });
    expect(heading).toHaveAttribute('id', 'message-a1');
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('renders each message time as accessible text', () => {
    const at = new Date(2026, 5, 8, 13, 53, 42).getTime();
    const withTime = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello!' }],
        metadata: { createdAt: at },
      },
    ] as never;
    render(<MessageList messages={withTime} busy={false} />);
    // The time is present as text (exact string depends on the test machine's day vs `at`).
    expect(screen.getByText(/\d{1,2}:\d{2}:\d{2}\s(AM|PM)|at .*\d{4}/)).toBeInTheDocument();
  });

  it('renders a labelled Copy button for each user and assistant message', () => {
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    render(<MessageList messages={both} busy={false} />);
    expect(screen.getByRole('button', { name: 'Copy your message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Copy Assistant's message" })).toBeInTheDocument();
  });

  it('renders a role-aware Message actions trigger per message when messageActions.branchFromHere is provided', () => {
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    render(
      <MessageList messages={both} busy={false} messageActions={{ branchFromHere: vi.fn() }} />,
    );
    // Each row keeps its direct Copy button AND gains the actions trigger.
    expect(screen.getByRole('button', { name: 'Copy your message' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for your message' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: "Actions for Assistant's message" }),
    ).toBeInTheDocument();
  });

  it('renders no actions trigger when messageActions is omitted (only Copy remains)', () => {
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    render(<MessageList messages={both} busy={false} />);
    expect(screen.getByRole('button', { name: 'Copy your message' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for your message' }),
    ).not.toBeInTheDocument();
  });

  it('uses the configured display names for headings and the assistant Copy label', () => {
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    render(
      <MessageList
        messages={both}
        busy={false}
        displayNames={{ user: 'Akash', assistant: 'Claude' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Akash' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Claude' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Copy Claude's message" })).toBeInTheDocument();
  });

  it('falls back to You/Assistant when no displayNames prop is provided', () => {
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    render(<MessageList messages={both} busy={false} />);
    expect(screen.getByRole('heading', { name: 'You' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assistant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Copy Assistant's message" })).toBeInTheDocument();
  });

  it('renders distinct heading ids even when message ids are blank', () => {
    render(
      <MessageList messages={[blankMessage('user'), blankMessage('assistant')]} busy={false} />,
    );
    const headings = screen.getAllByRole('heading');
    const ids = headings.map((h) => h.getAttribute('id'));
    expect(ids).toEqual(['message-pos-0', 'message-pos-1']);
    // All ids must be distinct (no collisions on blank source ids).
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders the usage disclosure for an assistant message that has usage metadata', () => {
    const withUsage: AnvikaUIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello!' }],
        metadata: { createdAt: 1, usage: { tokens: { total: 150 } } },
      } as AnvikaUIMessage,
    ];
    render(<MessageList messages={withUsage} busy={false} />);
    expect(screen.getByText('Usage: 150 tokens')).toBeInTheDocument();
  });

  it('renders a not-today time per the supplied timestamp options (24h, no seconds, month-first, no weekday)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 11, 9, 0, 0)); // Thu 11 Jun 2026 (so 8 Jun is not today)
      const at = new Date(2026, 5, 8, 13, 53, 42).getTime();
      const withTime = [
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi' }],
          metadata: { createdAt: at },
        },
      ] as never;
      render(
        <MessageList
          messages={withTime}
          busy={false}
          timestampOptions={{
            weekday: false,
            dateStyle: 'month-first',
            hourCycle: 'h24',
            seconds: false,
          }}
        />,
      );
      expect(screen.getByText('June 8, 2026 at 13:53')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('defaults to the earlier output when no timestamp options are passed', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 8, 18, 0, 0)); // same day as `at`
      const at = new Date(2026, 5, 8, 13, 53, 42).getTime();
      const withTime = [
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi' }],
          metadata: { createdAt: at },
        },
      ] as never;
      render(<MessageList messages={withTime} busy={false} />);
      expect(screen.getByText('1:53:42 PM')).toBeInTheDocument();
      expect(DEFAULT_TIMESTAMP_OPTIONS.hourCycle).toBe('h12');
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the inline editor on a user row Edit and hides that row body/copy while editing', async () => {
    const user = userEvent.setup();
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    render(
      <MessageList
        messages={both}
        busy={false}
        messageActions={{ edit: vi.fn() }}
        editConfig={{ sendKeyMode: 'modEnter', sendBinding: 'mod+enter' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions for your message' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit message' }));
    const editor = await screen.findByRole('textbox', { name: 'Edit message' });
    expect(editor).toHaveValue('Hi there');
    // The edited row swaps body+copy for the editor; the assistant row's Copy stays.
    expect(screen.queryByRole('button', { name: 'Copy your message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Copy Assistant's message" })).toBeInTheDocument();
    // The heading stays present so heading-by-heading nav is intact while editing.
    expect(screen.getByRole('heading', { name: 'You' })).toBeInTheDocument();
  });

  it('submitting the editor calls messageActions.edit with the id and edited text, then closes', async () => {
    const user = userEvent.setup();
    const edit = vi.fn();
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
    ];
    render(
      <MessageList
        messages={both}
        busy={false}
        messageActions={{ edit }}
        editConfig={{ sendKeyMode: 'modEnter', sendBinding: 'mod+enter' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions for your message' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit message' }));
    const editor = await screen.findByRole('textbox', { name: 'Edit message' });
    await user.clear(editor);
    await user.type(editor, 'Edited text');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(edit).toHaveBeenCalledWith('u1', 'Edited text');
    // Editor closed; the row body and Copy are back.
    expect(screen.queryByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy your message' })).toBeInTheDocument();
  });

  it('cancelling the editor closes it without calling edit', async () => {
    const user = userEvent.setup();
    const edit = vi.fn();
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
    ];
    render(
      <MessageList
        messages={both}
        busy={false}
        messageActions={{ edit }}
        editConfig={{ sendKeyMode: 'modEnter', sendBinding: 'mod+enter' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions for your message' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit message' }));
    await screen.findByRole('textbox', { name: 'Edit message' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(edit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy your message' })).toBeInTheDocument();
  });

  it('switching Edit from one user row to another closes the first editor and opens only the second', async () => {
    const user = userEvent.setup();
    const rows: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'First message' }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Second message' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    render(
      <MessageList
        messages={rows}
        busy={false}
        messageActions={{ edit: vi.fn() }}
        editConfig={{ sendKeyMode: 'modEnter', sendBinding: 'mod+enter' }}
      />,
    );
    // Open Edit on row A (the FIRST user message): exactly one editor, prefilled with A's text.
    const triggers = screen.getAllByRole('button', { name: 'Actions for your message' });
    await user.click(triggers[0] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: 'Edit message' }));
    let editor = await screen.findByRole('textbox', { name: 'Edit message' });
    expect(editor).toHaveValue('First message');
    expect(screen.getAllByRole('textbox', { name: 'Edit message' })).toHaveLength(1);

    // Open Edit on row B (the SECOND user message): A's editor closes, only B's editor remains.
    const triggersAfter = screen.getAllByRole('button', { name: 'Actions for your message' });
    await user.click(triggersAfter[triggersAfter.length - 1] as HTMLElement);
    await user.click(await screen.findByRole('menuitem', { name: 'Edit message' }));
    editor = await screen.findByRole('textbox', { name: 'Edit message' });
    // Exactly ONE editor in the document after switching, and it holds B's text - proving A's editor
    // closed (its body returned: A's text is no longer in any editor) and only B's is open.
    const editors = screen.getAllByRole('textbox', { name: 'Edit message' });
    expect(editors).toHaveLength(1);
    expect(editor).toHaveValue('Second message');
    expect(editors.some((t) => (t as HTMLTextAreaElement).value === 'First message')).toBe(false);
    // A's closed editor restored its normal body and Copy (it is no longer being edited).
    expect(screen.getByRole('button', { name: 'Copy your message' })).toBeInTheDocument();

    // A third, non-edited row (the assistant) keeps its normal body and Copy while one row edits.
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Copy Assistant's message" })).toBeInTheDocument();
  });

  it('calls onEditingChange(true) when editor opens and onEditingChange(false) when it closes', async () => {
    const user = userEvent.setup();
    const onEditingChange = vi.fn();
    const both: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
    ];
    render(
      <MessageList
        messages={both}
        busy={false}
        messageActions={{ edit: vi.fn() }}
        editConfig={{ sendKeyMode: 'modEnter', sendBinding: 'mod+enter' }}
        onEditingChange={onEditingChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Actions for your message' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit message' }));
    await screen.findByRole('textbox', { name: 'Edit message' });
    expect(onEditingChange).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument();
    expect(onEditingChange).toHaveBeenCalledWith(false);
  });

  it('shows no Edit affordance on an assistant row', async () => {
    const user = userEvent.setup();
    const both: AnvikaUIMessage[] = [
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
    ];
    render(
      <MessageList
        messages={both}
        busy={false}
        messageActions={{ edit: vi.fn(), regenerate: vi.fn() }}
        editConfig={{ sendKeyMode: 'modEnter', sendBinding: 'mod+enter' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: "Actions for Assistant's message" }));
    expect(screen.queryByRole('menuitem', { name: 'Edit message' })).not.toBeInTheDocument();
  });

  it('re-renders at midnight so a "today" timestamp flips to its dated form', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 8, 23, 50, 0)); // Mon 8 Jun 2026, 11:50 PM local
      const at = new Date(2026, 5, 8, 23, 30, 0).getTime(); // same day, 20 minutes earlier
      const withTime = [
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi' }],
          metadata: { createdAt: at },
        },
      ] as never;
      render(<MessageList messages={withTime} busy={false} />);
      // Same local day as `now`: a bare clock time, no date.
      expect(screen.getByText('11:30:00 PM')).toBeInTheDocument();
      // Roll past local midnight and let the scheduled refresh fire.
      act(() => {
        vi.setSystemTime(new Date(2026, 5, 9, 0, 1, 0));
        vi.advanceTimersByTime(15 * 60 * 1000); // past the 00:00 boundary from 23:50
      });
      // No longer today: the full weekday, date, and time.
      expect(screen.getByText('Monday, 8th June 2026 at 11:30:00 PM')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
