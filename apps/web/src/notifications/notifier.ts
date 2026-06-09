import type { NotificationEvent } from './events';

/** An output channel: renders a semantic event in one medium (speech today; audio cues later). */
export type NotificationChannel = (event: NotificationEvent) => void;

const channels: NotificationChannel[] = [];

/** Register an output channel. Called once per channel at app startup (ADR 0013). */
export function registerChannel(channel: NotificationChannel): void {
  channels.push(channel);
}

/**
 * Raise a semantic event; every registered channel renders it. The single entry point the UI uses
 * to announce anything. The notifier itself neither speaks nor logs - those are channels (speech
 * and log; see `register.ts`), so it never touches event payloads and cannot leak content.
 */
export function notify(event: NotificationEvent): void {
  for (const channel of channels) channel(event);
}

/** Remove every registered channel. Test-only, to isolate registrations between cases. */
export function resetChannels(): void {
  channels.length = 0;
}
