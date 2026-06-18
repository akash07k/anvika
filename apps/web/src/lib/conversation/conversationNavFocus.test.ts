import { afterEach, describe, expect, it } from 'vitest';

import { CONVERSATIONS_HEADING_ID } from '../../components/conversations/sectionRowFocus';
import { focusActiveConversationRow, focusPinnedConversationRow } from './conversationNavFocus';

/** Build the conversation-list nav DOM with the given rows, marking `currentIndex` as active. */
function buildNav(rowIds: string[], currentIndex: number | null): void {
  document.body.innerHTML = `
    <nav aria-label="Conversations List">
      <h2 id="${CONVERSATIONS_HEADING_ID}" tabindex="-1">Conversations</h2>
      ${rowIds
        .map(
          (id, i) =>
            `<a id="${id}" href="#" ${i === currentIndex ? 'aria-current="page"' : ''}>Row ${i}</a>`,
        )
        .join('')}
    </nav>
  `;
}

describe('focusActiveConversationRow', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the active row (aria-current="page") when one exists', () => {
    buildNav(['conversation-link-recent-a', 'conversation-link-recent-b'], 1);
    focusActiveConversationRow();
    expect(document.getElementById('conversation-link-recent-b')).toHaveFocus();
  });

  it('falls back to the first row when no row is active', () => {
    buildNav(['conversation-link-recent-a', 'conversation-link-recent-b'], null);
    focusActiveConversationRow();
    expect(document.getElementById('conversation-link-recent-a')).toHaveFocus();
  });

  it('falls back to the list heading when there are no rows', () => {
    buildNav([], null);
    focusActiveConversationRow();
    expect(document.getElementById(CONVERSATIONS_HEADING_ID)).toHaveFocus();
  });
});

/**
 * Build the conversation-list nav DOM with the given pinned rows (marking `currentIndex` active). The
 * Pinned section item (`#section-item-pinned`) and its always-mounted trigger button are present even
 * when no rows render, so the collapsed-section trigger fallback can be exercised. The trigger button
 * mirrors the rendered markup (the `data-slot="accordion-trigger"` Radix gives it).
 */
function buildPinnedNav(rowIds: string[], currentIndex: number | null): void {
  const rows = rowIds
    .map(
      (id, i) =>
        `<a id="${id}" href="#" ${i === currentIndex ? 'aria-current="page"' : ''}>Row ${i}</a>`,
    )
    .join('');
  document.body.innerHTML = `
    <nav aria-label="Conversations List">
      <div id="section-item-pinned">
        <button data-slot="accordion-trigger">Pinned</button>
      </div>
      ${rows}
    </nav>
  `;
}

describe('focusPinnedConversationRow', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the active pinned row (aria-current="page") when one exists', () => {
    buildPinnedNav(['conversation-link-pinned-a', 'conversation-link-pinned-b'], 1);
    focusPinnedConversationRow();
    expect(document.getElementById('conversation-link-pinned-b')).toHaveFocus();
  });

  it('falls back to the first pinned row when none is active', () => {
    buildPinnedNav(['conversation-link-pinned-a', 'conversation-link-pinned-b'], null);
    focusPinnedConversationRow();
    expect(document.getElementById('conversation-link-pinned-a')).toHaveFocus();
  });

  it('falls back to the Pinned section trigger when no pinned rows are rendered', () => {
    buildPinnedNav([], null);
    focusPinnedConversationRow();
    const trigger = document.querySelector('#section-item-pinned [data-slot="accordion-trigger"]');
    expect(trigger).toHaveFocus();
  });
});
