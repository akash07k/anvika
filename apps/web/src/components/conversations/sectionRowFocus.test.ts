import { afterEach, describe, expect, test } from 'vitest';

import { nextSiblingRowId, sectionLinkPrefix } from './sectionRowFocus';

/** Render anchor (row link) elements with the given ids into the document body. */
function mountLinks(ids: string[]): void {
  const ul = document.createElement('ul');
  for (const id of ids) {
    const a = document.createElement('a');
    a.id = id;
    ul.appendChild(a);
  }
  document.body.appendChild(ul);
}

/** Render non-anchor menu-item elements (`div role="menuitem"`) with the given ids. */
function mountMenuItems(ids: string[]): void {
  for (const id of ids) {
    const div = document.createElement('div');
    div.id = id;
    div.setAttribute('role', 'menuitem');
    document.body.appendChild(div);
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('sectionLinkPrefix', () => {
  test('keeps look-alike section ids distinct via the trailing hyphen', () => {
    expect(sectionLinkPrefix('last30')).toBe('conversation-link-last30-');
    expect(sectionLinkPrefix('last3m')).toBe('conversation-link-last3m-');
    // The last30 prefix must not select a last3m row (the hyphen disambiguates the shared `last3` stem).
    expect(sectionLinkPrefix('last30').startsWith(sectionLinkPrefix('last3m'))).toBe(false);
  });
});

describe('nextSiblingRowId', () => {
  const prefix = sectionLinkPrefix('pinned');

  test('returns the NEXT sibling when the leaving row is not last', () => {
    mountLinks([`${prefix}aaa-aaa`, `${prefix}bbb-bbb`, `${prefix}ccc-ccc`]);
    expect(nextSiblingRowId(prefix, `${prefix}aaa-aaa`)).toBe(`${prefix}bbb-bbb`);
    expect(nextSiblingRowId(prefix, `${prefix}bbb-bbb`)).toBe(`${prefix}ccc-ccc`);
  });

  test('falls back to the PREVIOUS sibling when the leaving row is last', () => {
    mountLinks([`${prefix}aaa-aaa`, `${prefix}bbb-bbb`]);
    expect(nextSiblingRowId(prefix, `${prefix}bbb-bbb`)).toBe(`${prefix}aaa-aaa`);
  });

  test('returns null when the leaving row is the only row in the section', () => {
    mountLinks([`${prefix}aaa-aaa`]);
    expect(nextSiblingRowId(prefix, `${prefix}aaa-aaa`)).toBeNull();
  });

  test('ignores rows from OTHER sections (prefix-scoped)', () => {
    mountLinks([`${prefix}aaa-aaa`, `conversation-link-recent-bbb-bbb`]);
    // The pinned row is alone in its section, so even with a recent row present the result is null.
    expect(nextSiblingRowId(prefix, `${prefix}aaa-aaa`)).toBeNull();
  });

  test('returns null when the leaving row id is not in the DOM', () => {
    mountLinks([`${prefix}aaa-aaa`]);
    expect(nextSiblingRowId(prefix, `${prefix}zzz-zzz`)).toBeNull();
  });

  test("ignores the row's own menu items, which share the link id prefix", () => {
    // The open menu renders items whose ids extend the link id (e.g. `${linkId}-menu-pin`) and so match
    // the section prefix; only the anchor row link is a sibling, so a lone pinned row still yields null.
    mountLinks([`${prefix}aaa-aaa`]);
    mountMenuItems([`${prefix}aaa-aaa-menu-pin`, `${prefix}aaa-aaa-menu-branch`]);
    expect(nextSiblingRowId(prefix, `${prefix}aaa-aaa`)).toBeNull();
  });
});
