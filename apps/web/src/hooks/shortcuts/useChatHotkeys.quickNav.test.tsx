import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';

import { events, expectFocus, registerHotkeyHooks, renderHarness } from './useChatHotkeys.testkit';

registerHotkeyHooks();

describe('useChatHotkeys quick-nav read and double-press', () => {
  it('quick-nav single press emits quickNavRead for the slot message (most recent = slot 1)', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}1{/Alt}');
    const ev = events.find((e) => e.type === 'quickNavRead');
    expect(ev).toBeDefined();
    // Slot 1 = messages[last] = the assistant 'hello' message; the descriptor names the role + text.
    expect((ev as { text: string }).text).toContain('Assistant');
    expect((ev as { text: string }).text).toContain('hello');
  });

  it('quick-nav single press in full mode keeps the role and reads the complete text', async () => {
    renderHarness(vi.fn(), 'full');
    await userEvent.keyboard('{Alt>}1{/Alt}');
    const ev = events.find((e) => e.type === 'quickNavRead');
    expect(ev).toBeDefined();
    // The bug this guards: full mode dropped the role, so the listener could not tell the sender.
    expect((ev as { text: string }).text).toContain('Assistant');
    expect((ev as { text: string }).text).toContain('hello');
    expect((ev as { text: string }).text).not.toContain('short'); // full, not the descriptor's bucket
  });

  it('quick-nav double press within the window focuses the slot message', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}1{/Alt}');
    await userEvent.keyboard('{Alt>}1{/Alt}');
    await expectFocus('message-a1');
  });

  it('jumps and quick-nav speak a no-op notice when there is no such message', async () => {
    renderHarness(vi.fn(), 'descriptor', []);
    await userEvent.keyboard('{Alt>}a{/Alt}');
    await userEvent.keyboard('{Alt>}u{/Alt}');
    await userEvent.keyboard('{Alt>}1{/Alt}');
    const roles = events.filter((e) => e.type === 'noMessageForRole');
    expect(roles.map((e) => (e as { role: string }).role)).toEqual(['assistant', 'user']);
    expect(events.some((e) => e.type === 'quickNavEmpty')).toBe(true);
  });

  it('double-press focus still works after an intervening jump', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}1{/Alt}'); // read
    await userEvent.keyboard('{Alt>}1{/Alt}'); // focus a1
    await expectFocus('message-a1');
    await userEvent.keyboard('{Alt>}u{/Alt}'); // jump to the user heading
    await expectFocus('message-u1');
    await userEvent.keyboard('{Alt>}1{/Alt}'); // read again
    await userEvent.keyboard('{Alt>}1{/Alt}'); // focus a1 again
    await expectFocus('message-a1');
  });

  it('double-press on a blank-id message focuses its positional handle', async () => {
    // The most recent message (slot Alt+1) has a blank id - the bug: focus would target `message-`.
    const blankIdMsgs = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: '', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
    ] as AnvikaUIMessage[];
    renderHarness(vi.fn(), 'descriptor', blankIdMsgs);
    await userEvent.keyboard('{Alt>}1{/Alt}');
    await userEvent.keyboard('{Alt>}1{/Alt}');
    // lastIndex = 1, so the stable handle is `pos-1`; focus must land there, not on `message-`.
    await expectFocus('message-pos-1');
    expect(document.getElementById('message-')).toBeNull();
  });
});
