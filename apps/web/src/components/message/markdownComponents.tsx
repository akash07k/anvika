import type { ComponentPropsWithoutRef } from 'react';

/**
 * Build a Streamdown heading override that shifts a markdown heading level down by two so the
 * message's own `h2` (rendered by {@link MessageList}) stays the section heading and the model's
 * markdown nests beneath it (ADR 0014). Markdown `h1..h4` become native `h3..h6`; `h5`/`h6` would
 * overflow past `h6`, so they render as `role="heading"` with `aria-level` 7/8 to keep the outline
 * correct without inventing a non-existent `h7`/`h8` element.
 *
 * @param markdownLevel - The source markdown heading level (1-6) this override is registered for.
 * @returns A React component that renders the offset heading, stripping the non-DOM `node` prop.
 */
function offsetHeading(markdownLevel: 1 | 2 | 3 | 4 | 5 | 6) {
  const level = markdownLevel + 2;
  return function OffsetHeading({
    node: _node,
    ...props
  }: ComponentPropsWithoutRef<'h3'> & { node?: unknown }) {
    if (level <= 6) {
      const Tag = `h${level}` as 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag {...props} />;
    }
    // No `h7`/`h8` element exists, so a markdown `h5`/`h6` that overflows past `h6` must use an
    // explicit `role="heading"` with `aria-level` to keep the document outline correct.
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    return <div role="heading" aria-level={level} {...props} />;
  };
}

/**
 * Streamdown anchor override that forces external-link safety: links open in a new tab with
 * `rel="noopener noreferrer"` so a model-supplied link cannot reach back into the opener window.
 * Opening in a new tab is a deliberate context change (the conversation stays put), so a
 * visually-hidden " (opens in a new tab)" is appended to warn screen-reader users before they
 * activate the link (WCAG G201). The non-DOM `node` prop is stripped so it is not spread onto the
 * real `<a>` element.
 *
 * @param props - Standard anchor props from Streamdown (plus a `node` prop that is discarded).
 * @returns A hardened anchor element.
 */
function SafeLink({
  node: _node,
  children,
  ...props
}: ComponentPropsWithoutRef<'a'> & { node?: unknown }) {
  return (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * The shared Streamdown component overrides used wherever model markdown is rendered (the answer
 * body and the Thinking region), so both nest their headings under the message `h2` and harden
 * model-supplied links identically.
 */
export const MARKDOWN_COMPONENTS = {
  h1: offsetHeading(1),
  h2: offsetHeading(2),
  h3: offsetHeading(3),
  h4: offsetHeading(4),
  h5: offsetHeading(5),
  h6: offsetHeading(6),
  a: SafeLink,
};
