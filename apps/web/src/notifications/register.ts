import { logChannel } from './channels/log';
import { speechChannel } from './channels/speech';
import { registerChannel } from './notifier';

let registered = false;

/**
 * Register the built-in notification channels exactly once (idempotent, so StrictMode double-mount
 * and HMR do not double-register). Called from the app entry point at startup. Two channels today:
 * speech (the screen-reader announcement) and log (the diagnostic server-log trail). A future
 * audio-cue channel is added here with one more `registerChannel` call (ADR 0013).
 */
export function registerNotificationChannels(): void {
  if (registered) return;
  registered = true;
  registerChannel(speechChannel);
  registerChannel(logChannel);
}
