import type { ClientLogEvent } from '@anvika/shared/client-log';

import { diagnostics } from '../diagnostics/logDiag';

/**
 * Forward a known notification milestone code to the server through the batched diagnostic pipe,
 * optionally with allow-listed content text (attached only by the log channel under the content
 * opt-in). Only allow-listed codes and the gated text cross the boundary. The server registry derives
 * the level from the code.
 *
 * @param event - The allow-listed client log event code.
 * @param text - Optional allow-listed content text (content-bearing codes only).
 */
export function clientLog(event: ClientLogEvent, text?: string): void {
  diagnostics.clientLog(event, text);
}
