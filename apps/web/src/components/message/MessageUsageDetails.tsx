import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { estimateCost } from '../../lib/format/estimateCost';
import { useSettingsStore } from '../../stores/settingsStore';
import { CollapsibleSection } from './CollapsibleSection';

/** Props for {@link MessageUsageDetails}. */
export interface MessageUsageDetailsProps {
  /** The message whose `usage` metadata (assistant turns only) is shown. */
  message: AnvikaUIMessage;
}

/** The display model name: the part after the `provider:` prefix, or the whole id. */
function shortModel(modelId: string): string {
  const colon = modelId.indexOf(':');
  return colon >= 0 ? modelId.slice(colon + 1) : modelId;
}

/**
 * A collapsed, screen-reader-friendly disclosure of a turn's usage metadata. The
 * `<summary>` reads "Usage: N tokens"; expanding reveals a labelled list of the model, token
 * breakdown, finish reason, and estimated cost (omitted when the model is unpriced). An errored or
 * aborted turn is marked in the summary (`Usage (stopped)` / `Usage (error)`) and gets a leading
 * `Outcome:` line. The estimated cost renders in the user's selected currency (USD or INR) read from
 * the settings store, falling back to USD before the store hydrates. Renders nothing for a message
 * with no `usage` block (user messages, or turns from before this feature).
 */
export function MessageUsageDetails({ message }: MessageUsageDetailsProps) {
  const settings = useSettingsStore((s) => s.settings);
  const usage = message.metadata?.usage;
  if (!usage) return null;
  const t = usage.tokens;
  // Derive total from input+output when the provider omits it, so the at-a-glance summary number is
  // present for every provider that reports any token count.
  const total =
    t?.total ??
    (t?.input !== undefined || t?.output !== undefined
      ? (t.input ?? 0) + (t.output ?? 0)
      : undefined);
  const cost = estimateCost(
    usage,
    settings ? { currency: settings.currency, inrPerUsd: settings.inrPerUsd } : undefined,
  );
  const incompleteLabel =
    usage.incompleteReason === 'aborted'
      ? 'stopped'
      : usage.incompleteReason === 'error'
        ? 'error'
        : undefined;
  const summary =
    total !== undefined
      ? `Usage${incompleteLabel ? ` (${incompleteLabel})` : ''}: ${total.toLocaleString()} tokens`
      : incompleteLabel
        ? `Usage (${incompleteLabel})`
        : 'Usage';
  return (
    <CollapsibleSection regionLabel="Token usage" summary={summary}>
      <ul>
        {usage.incompleteReason !== undefined ? (
          <li>
            Outcome:{' '}
            {usage.incompleteReason === 'aborted'
              ? 'Stopped before completion'
              : 'Ended with an error'}
          </li>
        ) : null}
        {usage.modelId !== undefined ? <li>Model: {shortModel(usage.modelId)}</li> : null}
        {t?.input !== undefined ? <li>Input tokens: {t.input.toLocaleString()}</li> : null}
        {t?.output !== undefined ? <li>Output tokens: {t.output.toLocaleString()}</li> : null}
        {total !== undefined ? <li>Total tokens: {total.toLocaleString()}</li> : null}
        {t?.cacheRead !== undefined ? (
          <li>Cached input tokens: {t.cacheRead.toLocaleString()}</li>
        ) : null}
        {t?.cacheWrite !== undefined ? (
          <li>Cache-write tokens: {t.cacheWrite.toLocaleString()}</li>
        ) : null}
        {t?.reasoning !== undefined ? (
          <li>Reasoning tokens: {t.reasoning.toLocaleString()}</li>
        ) : null}
        {usage.finishReason !== undefined ? <li>Finish reason: {usage.finishReason}</li> : null}
        {cost !== null ? <li>Cost: {cost}</li> : null}
      </ul>
    </CollapsibleSection>
  );
}
