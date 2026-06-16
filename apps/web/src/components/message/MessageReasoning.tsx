import { code } from '@streamdown/code';
import { Streamdown } from 'streamdown';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { reasoningTextOf } from '../../lib/message/reasoning';
import { CollapsibleSection } from './CollapsibleSection';
import { CopyButton } from './CopyButton';
import { MARKDOWN_COMPONENTS } from './markdownComponents';

/** Props for {@link MessageReasoning}. */
export interface MessageReasoningProps {
  /** The assistant message whose `reasoning` parts are disclosed. */
  message: AnvikaUIMessage;
  /** Whether THIS message is the one currently streaming (drives Streamdown's `isAnimating`). */
  busy: boolean;
  /**
   * The message's dom id, used to build the focusable `thinking-${domId}` id that the Alt+R
   * `jumpToThinking` shortcut will target. The id is present now; the shortcut is not yet bound.
   */
  domId: string;
}

/**
 * Build the `<summary>` cue: "Thinking" plus, when known, the reasoning token count and the
 * whole-second duration from `metadata.reasoningMs`. Each part is appended only when present, so an
 * unfinished or count-less turn reads a clean "Thinking" with no dangling commas.
 *
 * @param message - The assistant message carrying the reasoning metadata.
 * @returns The screen-reader-clean summary string.
 */
function reasoningSummary(message: AnvikaUIMessage): string {
  const parts = ['Thinking'];
  const tokens = message.metadata?.usage?.tokens?.reasoning;
  if (tokens !== undefined) parts.push(`${tokens.toLocaleString()} tokens`);
  const ms = message.metadata?.reasoningMs;
  if (ms !== undefined) {
    const seconds = Math.round(ms / 1000);
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }
  return parts.join(', ');
}

/**
 * The accessible "Thinking" region: a collapsed native `<details>` placed before the
 * answer body, as {@link MessageUsageDetails} sits after it. The `<summary>` itself carries the
 * focusable `thinking-${domId}` id and is the operable disclosure control, natively focusable and
 * Tab-reachable; the id is also the target the Alt+R `jumpToThinking` shortcut will focus
 * (the shortcut is not bound yet). Its inner `<h3>` "Thinking" is the heading-nav target and
 * shows a cue with the reasoning token count and duration. The thinking text renders with Streamdown
 * and gets its own Copy button. Reasoning text is RESPONSE CONTENT: shown on demand here, never
 * auto-read or logged. Renders nothing when the message has no reasoning parts.
 *
 * @param props - {@link MessageReasoningProps}.
 * @returns The Thinking disclosure, or `null` when there is no reasoning to show.
 */
export function MessageReasoning({ message, busy, domId }: MessageReasoningProps) {
  const reasoning = reasoningTextOf(message);
  if (reasoning === '') return null;
  return (
    <CollapsibleSection
      summaryId={`thinking-${domId}`}
      regionLabel="Thinking"
      summary={<h3>{reasoningSummary(message)}</h3>}
    >
      <Streamdown
        plugins={{ code }}
        components={MARKDOWN_COMPONENTS}
        isAnimating={busy}
        linkSafety={{ enabled: false }}
        skipHtml
      >
        {reasoning}
      </Streamdown>
      <CopyButton text={reasoning} label="Copy thinking" />
    </CollapsibleSection>
  );
}
