import { isReasoningUIPart } from 'ai';

import { createdAtOf, type AnvikaUIMessage } from './anvikaMessage';
import type { RoleLabels } from '../format/displayNames';
import { textOf } from './messageText';
import { formatRelativeTime } from '../format/timeFormat';
import type { TimestampFormatOptions } from '../format/timestampOptions';

/** The spoken role label for a message, resolved from the provided {@link RoleLabels}. */
function roleLabel(message: AnvikaUIMessage, labels: RoleLabels): string {
  return message.role === 'user' ? labels.user : labels.assistant;
}

/** The relative-time prefix (`2 minutes ago, `) for a message, or empty when it has no `createdAt`. */
function relativePrefix(
  message: AnvikaUIMessage,
  now: number,
  options: TimestampFormatOptions,
): string {
  const at = createdAtOf(message);
  return at !== undefined ? `${formatRelativeTime(at, now, options)}, ` : '';
}

/** Options that shape the quick-nav descriptor (from settings; see SettingsSchema). */
export interface QuickNavDescriptorOptions {
  /** Where the truncation cue is spoken: the total count first, or the remaining count after. */
  lengthCue: 'count-first' | 'count-after';
  /** Words of preview shown before truncating - also the threshold that defines "truncated". */
  previewWords: number;
}

/** The plural suffix for "word": empty for exactly one, `s` otherwise. */
function plural(n: number): string {
  return n === 1 ? '' : 's';
}

/** The trailing ", thinking included" cue when the message carries reasoning, else empty. */
function thinkingCue(message: AnvikaUIMessage): string {
  return message.parts.some(isReasoningUIPart) ? ', thinking included' : '';
}

/**
 * Build the quick-nav single-press descriptor: role, a relative time (when known), the first
 * `previewWords` words with NO spoken ellipsis, and - only when the message is longer than the
 * preview - an exact word-count cue. Both positions end with the REMAINING count after the preview
 * so the truncation never feels abrupt; `count-first` additionally speaks the TOTAL before the
 * preview (`85 words. {preview}. 45 more words.`), while `count-after` speaks only the remaining
 * (`{preview}. 45 more words.`). A message that fits the preview gets no cue. A message with no
 * `createdAt` omits the time segment. When the message carries reasoning ("thinking") parts, a fixed
 * trailing `, thinking included` cue is appended on every path so the listener knows a Thinking region
 * is present; the cue is a constant and never includes any reasoning text.
 *
 * @param message - The message to describe.
 * @param now - The reference instant (typically the current time), milliseconds since the epoch.
 * @param options - The cue position and preview length (from settings).
 * @param labels - The spoken role labels for the message prefix (from settings via resolveDisplayLabels).
 * @param timestampOptions - How the absolute time fallback renders in the spoken descriptor (from settings).
 * @returns The screen-reader-clean descriptor string.
 */
export function describeMessage(
  message: AnvikaUIMessage,
  now: number,
  { lengthCue, previewWords }: QuickNavDescriptorOptions,
  labels: RoleLabels,
  timestampOptions: TimestampFormatOptions,
): string {
  const words = textOf(message).trim().split(/\s+/).filter(Boolean);
  const preview = words.slice(0, previewWords).join(' ');
  const prefix = `${roleLabel(message, labels)}, ${relativePrefix(message, now, timestampOptions)}`;
  const cue = thinkingCue(message);
  if (words.length <= previewWords) {
    // An empty message has no preview; drop the prefix's trailing ", " so it never reads
    // "Assistant, " with a dangling comma. The cue (itself ", thinking included")
    // appends cleanly after either the preview or the de-comma'd prefix.
    return preview === '' ? `${prefix.replace(/,?\s*$/, '')}${cue}` : `${prefix}${preview}${cue}`;
  }
  const remaining = words.length - previewWords;
  const remainingCount = `${remaining} more word${plural(remaining)}`;
  // The last clause ends EITHER with the comma-led thinking cue (when the message carries reasoning)
  // OR a terminal period, never both: appending the cue straight after a period would read as an
  // awkward "more words., thinking included" stutter in speech, which matters for a screen-reader
  // first app. The cue itself serves as the clause end when present.
  const tail = cue !== '' ? cue : '.';
  if (lengthCue === 'count-first') {
    return `${prefix}${words.length} word${plural(words.length)}. ${preview}. ${remainingCount}${tail}`;
  }
  return `${prefix}${preview}. ${remainingCount}${tail}`;
}

/**
 * Build the quick-nav full-content read: role, a relative time (when known), then the COMPLETE
 * message text. Used when `quickNavSinglePressReads` is `full`, so the listener still hears who sent
 * the message (the bare text alone does not say whether it is yours or the assistant's).
 *
 * @param message - The message to read in full.
 * @param now - The reference instant (typically the current time), milliseconds since the epoch.
 * @param labels - The spoken role labels for the message prefix (from settings via resolveDisplayLabels).
 * @param timestampOptions - How the absolute time fallback renders in the spoken prefix (from settings).
 * @returns The role- and time-prefixed full message text.
 */
export function readFullMessage(
  message: AnvikaUIMessage,
  now: number,
  labels: RoleLabels,
  timestampOptions: TimestampFormatOptions,
): string {
  return `${roleLabel(message, labels)}, ${relativePrefix(message, now, timestampOptions)}${textOf(message)}`;
}
