import type { TestOutcome } from '../../hooks/connections/useTestConnection';

/** Render the content-safe "Last test" summary text for an outcome, or `null` before the first test. */
function summaryText(outcome: TestOutcome | undefined): string | null {
  if (!outcome) return null;
  if (outcome.kind === 'ok') {
    const noun = outcome.modelCount === 1 ? 'model' : 'models';
    return `Last test: OK, found ${outcome.modelCount} ${noun}`;
  }
  if (outcome.kind === 'ok-no-listing') return 'Last test: OK; provider lists no models';
  return `Last test: failed (${outcome.category})`;
}

/**
 * A persistent, NON-live status line under a connection's heading that reflects the most recent test
 * outcome ({@link TestOutcome}). It renders nothing before the first test. It is deliberately not an
 * `aria-live` region: the test announcement is spoken once through the notification layer, and this
 * line is the durable record a screen-reader user can re-read on demand by navigating to it - a
 * second live announcement here would double-speak. Content-safe: it shows only a model count or a
 * failure category, never a secret, header value, or base URL.
 *
 * @param outcome - The last test's content-safe outcome, or `undefined` if no test has run.
 */
export function LastTestStatus({ outcome }: { outcome: TestOutcome | undefined }) {
  const text = summaryText(outcome);
  if (text === null) return null;
  return <p>{text}</p>;
}
