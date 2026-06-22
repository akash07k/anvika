import type { ConsoleFormatter, LogRecord, TextFormatter } from '@logtape/logtape';

import { formatTimestamp } from './format';
import { renderLogData } from './log-data';

/** Options controlling how an entry is rendered. */
export interface FormatOptions {
  /**
   * Whether to include the `- [category]` segment. The file sink always passes `true`;
   * the console sink passes the debug flag (hidden by default).
   */
  showCategory: boolean;
}

/**
 * Render a LogTape template message array into a single string. String parts are
 * concatenated verbatim; interpolated non-string values are stringified.
 *
 * @param message - The record's `message` template parts.
 * @returns The flattened message text.
 */
function renderMessage(message: LogRecord['message']): string {
  return message.map((part) => (typeof part === 'string' ? part : String(part))).join('');
}

/**
 * Build one Walnut-style log entry line, without a trailing newline:
 * `LEVEL: <message>` then (when shown) ` - [<category>]` then ` | <timestamp>` then
 * (when present) ` { <data> }`.
 *
 * @param record - The LogTape record to render.
 * @param options - Rendering options (category visibility).
 * @returns The single-line entry string.
 */
export function formatPretty(record: LogRecord, options: FormatOptions): string {
  const level = record.level.toUpperCase();
  const message = renderMessage(record.message);
  const category = options.showCategory ? ` - [${record.category.join('.')}]` : '';
  const timestamp = formatTimestamp(new Date(record.timestamp));
  const data = renderLogData(record.properties);
  const dataSegment = data === '' ? '' : ` ${data}`;
  return `${level}: ${message}${category} | ${timestamp}${dataSegment}`;
}

/**
 * Create a {@link TextFormatter} for the file sink: always shows the category and
 * appends a single blank line after each entry for screen-reader navigation.
 *
 * @returns A formatter that returns `<line>\n\n`.
 */
export function createFileFormatter(): TextFormatter {
  return (record) => `${formatPretty(record, { showCategory: true })}\n\n`;
}

/**
 * Create a {@link ConsoleFormatter} for the console sink. Category visibility follows
 * `showCategory` (debug mode). `console.*` adds its own newline, so the returned string
 * carries one extra `\n` to leave a blank line after the entry.
 *
 * @param options - Rendering options (category visibility).
 * @returns A formatter returning a single-element args array.
 */
export function createConsoleFormatter(options: FormatOptions): ConsoleFormatter {
  return (record) => [`${formatPretty(record, options)}\n`];
}
