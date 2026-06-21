# Assistant markdown headings nest under the message heading

Anvika's accessibility model is heading-first: every message renders an `<h2 id="message-X">` heading ("You"/"Assistant") under the page's single `<h1>Conversation</h1>`, and that `h2` is the anchor for heading-by-heading navigation and the quick-nav jumps. Assistant responses are rendered as markdown with Streamdown, and models routinely emit markdown headings (`#`, `##`, ...). Rendered as native `h1`-`h6`, those would appear *inside* a message and break the outline - a markdown `#` becomes an `<h1>` sitting **above** the message's `<h2>`, inverting the hierarchy and polluting the clean "one heading per message" structure.

Decision: offset markdown headings so they nest **under** the message's `h2`. Each markdown heading level is shifted by +2 - markdown `h1` to `h3`, `h2` to `h4`, `h3` to `h5`, `h4` to `h6` - rendered as native heading elements. Levels that overflow past `h6` (markdown `h5` to level 7, `h6` to level 8) are rendered as `<div role="heading" aria-level={n}>`, which is valid ARIA that screen readers announce and navigate. The offset is fixed (not computed from each response's own minimum heading) because the response streams: its minimum heading level is unknown until the whole message has arrived.

## Considered Options

- **Leave markdown headings as native `h1`-`h6`** - rejected. Inverts and pollutes the outline; directly undermines the heading-first navigation the app is built on.
- **Demote markdown headings to non-heading styled text** (bold paragraphs) - rejected. Keeps exactly one heading per message, but a long structured response becomes a wall with no internal heading jumps for a screen-reader user.
- **Offset +2, capped at `h6`** (markdown `h5`/`h6` collapse to `h6`) - rejected as the default. Simpler, but collapses deep levels so distinct nesting reads as the same level. The overflow case is rare, but ARIA expresses it correctly at no real cost.
- **Offset +2 with `aria-level` past `h6`** - chosen. The only option that keeps a valid, faithful, fully navigable outline while leaving message-to-message navigation untouched.

## Consequences

- Message-to-message navigation is unaffected: the message `h2`s remain the only level-2 headings (a screen reader's "jump to next heading level 2" still lands on messages), and quick-nav targets message ids, not heading levels.
- Navigating by *all* headings now includes a response's own sections - useful structure, not noise - at `h3` and deeper.
- Deeply nested markdown (`h5`/`h6`) yields heading levels 7/8 via `aria-level`; this is rare and degrades gracefully.
- Implemented as a `components` map in `MessageBody` (a small heading component that picks a native element or a `role="heading"` div by computed level). Reversible in principle, but rendered output and tests assume the offset.
