import { useEffect, useRef, type ReactNode } from 'react';

/** Props for {@link CollapsibleSection}. */
export interface CollapsibleSectionProps {
  /**
   * Optional id placed on the `<summary>` (the focusable disclosure toggle). Used as a focus target,
   * for example the Alt+R "jump to thinking" shortcut targets `thinking-${domId}`.
   */
  summaryId?: string;
  /** The accessible name for the expanded-content region landmark, e.g. "Thinking" or "Token usage". */
  regionLabel: string;
  /** The cue rendered inside the `<summary>` (often a heading). */
  summary: ReactNode;
  /** The disclosure body, exposed as a labelled region landmark only while the section is expanded. */
  children: ReactNode;
}

/**
 * A native `<details>` disclosure with two screen-reader and keyboard affordances layered on:
 *
 * - Its expanded body is wrapped in a labelled `region` landmark (`<section aria-label>`), so a
 *   screen-reader user can tell when they enter and leave the disclosed content. A collapsed
 *   `<details>` hides its content, so the landmark only exists while the section is expanded and the
 *   landmark list is not cluttered by collapsed sections.
 * - Pressing Escape while keyboard focus is INSIDE an open section collapses it and returns focus to
 *   the `<summary>`. This fires only when something inside actually holds DOM focus (the summary or a
 *   focusable child); it does not fire while reading the body with a screen-reader virtual cursor,
 *   which is a limitation of the native disclosure, not of this component.
 *
 * The `<summary>` stays the native, Tab-reachable toggle; Space and Enter toggle it as usual.
 *
 * @param props - {@link CollapsibleSectionProps}.
 * @returns The disclosure element.
 */
export function CollapsibleSection({
  summaryId,
  regionLabel,
  summary,
  children,
}: CollapsibleSectionProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  // Attach the Escape-to-collapse listener natively on the <details> (the common ancestor) rather
  // than via a JSX handler: this catches Escape bubbling from any focused descendant (the summary or
  // a focusable child such as a Copy button), and keeps the key handler off a non-interactive element
  // in the JSX. Only acts when the section is open; returns focus to the summary on collapse.
  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      // Only a BARE Escape collapses. A modified Escape (notably Shift+Escape, the global
      // stop-generation hotkey) must pass through untouched, or stopPropagation below would swallow
      // it before it reaches the document-level hotkey listener while a disclosure is focused.
      if (
        event.key !== 'Escape' ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        !details.open
      ) {
        return;
      }
      // Stop the event so any (current or future) global bare-Escape handler does not also act on it.
      event.preventDefault();
      event.stopPropagation();
      details.open = false;
      summaryRef.current?.focus();
    };
    details.addEventListener('keydown', onKeyDown);
    return () => details.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <details ref={detailsRef}>
      <summary id={summaryId} ref={summaryRef}>
        {summary}
      </summary>
      <section aria-label={regionLabel}>{children}</section>
    </details>
  );
}
