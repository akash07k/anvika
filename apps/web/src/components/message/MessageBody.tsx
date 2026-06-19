import { code } from '@streamdown/code';
import { Streamdown } from 'streamdown';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { textOf } from '../../lib/message/messageText';
import { MARKDOWN_COMPONENTS } from './markdownComponents';

/** Props for {@link MessageBody}. */
export interface MessageBodyProps {
  /** The message to render. Assistant text is markdown; user text is plain. */
  message: AnvikaUIMessage;
  /** Whether THIS message is the one currently streaming (drives Streamdown's `isAnimating`). */
  busy: boolean;
}

/**
 * Render a single message's body. Assistant messages render their text as markdown via Streamdown
 * (semantic HTML, offset headings, incomplete-markdown handling for streaming, and hardened links);
 * user messages render as a plain `<p>` so a stray `#` in a prompt is never reinterpreted as a
 * heading. Raw HTML in model output is dropped with `skipHtml` while Streamdown's default sanitize
 * plugins stay intact. `isAnimating` only disables Streamdown's copy buttons while a response
 * streams in; no streaming caret is rendered because the `caret` prop is left off, and Streamdown's
 * caret (when enabled) is a CSS `::after` pseudo-element that is never in the accessibility tree, so
 * a screen reader is never interrupted by it regardless.
 *
 * @param props - {@link MessageBodyProps}: the message and whether it is the streaming one.
 * @returns The rendered message body.
 */
export function MessageBody({ message, busy }: MessageBodyProps) {
  if (message.role !== 'assistant') {
    return <p>{textOf(message)}</p>;
  }
  return (
    <Streamdown
      plugins={{ code }}
      components={MARKDOWN_COMPONENTS}
      isAnimating={busy}
      linkSafety={{ enabled: false }}
      skipHtml
    >
      {textOf(message)}
    </Streamdown>
  );
}
