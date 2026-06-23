import type { NotificationPriority } from './events';

declare global {
  interface Document {
    /** The ariaNotify web API (Chrome 147+, Firefox 150+); absent on Safari/WebKit as of 2026. */
    ariaNotify?: (message: string, options?: { priority?: NotificationPriority }) => void;
  }
}

let liveRegion: HTMLElement | null = null;
let messageSpan: HTMLElement | null = null;
let nonceSpan: HTMLElement | null = null;
let nonce = 0;

/** The fallback region and its two spans: the spoken message and the aria-hidden re-announce nonce. */
interface LiveRegion {
  region: HTMLElement;
  messageEl: HTMLElement;
  nonceEl: HTMLElement;
}

/**
 * Lazily create the single visually-hidden `aria-live` region used by the fallback path. It holds a
 * message span (the spoken text) plus an `aria-hidden` nonce span: changing the nonce mutates the
 * region so two identical consecutive messages still re-announce, while `aria-hidden` keeps the nonce
 * digits out of the spoken output. `aria-atomic` makes the AT read the whole region (the message) on
 * any change, including a nonce-only change.
 */
function getLiveRegion(): LiveRegion {
  if (liveRegion && messageSpan && nonceSpan) {
    return { region: liveRegion, messageEl: messageSpan, nonceEl: nonceSpan };
  }
  const region = document.createElement('div');
  region.setAttribute('data-anvika-live', '');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  Object.assign(region.style, {
    position: 'absolute',
    left: '-10000px',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
  });
  const messageEl = document.createElement('span');
  const nonceEl = document.createElement('span');
  nonceEl.setAttribute('aria-hidden', 'true');
  region.append(messageEl, nonceEl);
  document.body.appendChild(region);
  liveRegion = region;
  messageSpan = messageEl;
  nonceSpan = nonceEl;
  return { region, messageEl, nonceEl };
}

/**
 * Eagerly mount the empty fallback region once at module load, before any announcement. A
 * screen reader only reliably announces an `aria-live` region that already existed (empty) when its
 * content changes; a region created and filled in the same tick - as happens for the very first
 * announcement during app mount, e.g. `settingsLoadDegraded` - is often dropped. Pre-creating it
 * empty means the first real announcement is a content change into an established region. No-op when
 * `document.ariaNotify` exists (the fallback is unused) or when there is no `document.body` yet
 * (SSR/early import); in the latter case {@link getLiveRegion} still creates it lazily on first use.
 */
function ensureLiveRegion(): void {
  if (typeof document === 'undefined' || !document.body) return;
  if (typeof document.ariaNotify === 'function') return;
  getLiveRegion();
}

ensureLiveRegion();

/**
 * Announce a message to screen readers. Prefers `document.ariaNotify` (explicit, queued, and
 * re-announces repeated identical strings); otherwise writes to a visually-hidden `aria-live`
 * region whose politeness tracks the priority. An identical consecutive message still re-announces
 * because an aria-hidden nonce span mutates (the nonce is never spoken). The path chosen is internal
 * to this function; callers just call it (ADR 0013).
 */
export function announce(message: string, priority: NotificationPriority = 'normal'): void {
  if (typeof document.ariaNotify === 'function') {
    document.ariaNotify(message, { priority });
    return;
  }
  const { region, messageEl, nonceEl } = getLiveRegion();
  region.setAttribute('aria-live', priority === 'high' ? 'assertive' : 'polite');
  messageEl.textContent = message;
  nonceEl.textContent = String(nonce++ % 100);
}
