/**
 * Keyboard and platform helpers for the web client: macOS platform detection, resolving which
 * hotkey binding sends, and rendering binding strings for both the WAI-ARIA `aria-keyshortcuts`
 * attribute and the human-readable shortcuts cheatsheet. All pure over their arguments (the one
 * exception, {@link isMac}, reads `navigator` once and delegates to the pure {@link detectIsMac}),
 * so they are trivially testable.
 */

/**
 * The subset of `Navigator` platform detection reads. `userAgentData` is a non-standard UA-CH API
 * not yet included in the TypeScript lib DOM types, so we model it locally rather than casting to
 * `any`. Exported so tests can build fake navigator objects without `any`.
 */
export interface PlatformNavigator {
  /** Modern UA-CH platform string, e.g. `'macOS'`, `'Windows'`. */
  readonly userAgentData?: { readonly platform?: string };
  /** Legacy user-agent string. */
  readonly userAgent?: string;
  /** Legacy platform string, e.g. `'MacIntel'`, `'Win32'`. */
  readonly platform?: string;
}

/**
 * Detect whether `nav` describes a macOS platform, preferring the modern `userAgentData.platform`
 * and falling back to the legacy `userAgent` + `platform` strings. Pure over its argument so it is
 * fully testable without touching globals; the single platform-detection implementation in the app.
 *
 * @param nav - The navigator-like object to inspect.
 * @returns `true` when the resolved platform string matches `/mac/i`.
 */
export function detectIsMac(nav: PlatformNavigator): boolean {
  const modern = nav.userAgentData?.platform;
  if (modern) return /mac/i.test(modern);
  return /mac/i.test(`${nav.userAgent ?? ''} ${nav.platform ?? ''}`);
}

/**
 * Whether the current platform is macOS, used to label the send modifier ("Command" vs "Control")
 * in spoken feedback. Guards a missing `navigator` and delegates to {@link detectIsMac}, the single
 * detection implementation, so the wording source ({@link messageForEvent}) stays a pure mapping
 * that takes the platform as event data.
 *
 * @returns true when running on macOS.
 */
export function isMac(): boolean {
  return typeof navigator === 'undefined' ? false : detectIsMac(navigator);
}

/**
 * Resolve which react-hotkeys-hook binding string SENDS, given the send-key mode and the configured
 * send binding. In `enter` mode plain Enter sends (so the helper returns the literal `'enter'`); in
 * `modEnter` mode the configured `sendBinding` (e.g. `'mod+enter'`) sends and plain Enter inserts a
 * newline. Pure; shared by the Composer and the inline message editor so both honor the same setting.
 *
 * @param mode - The send-key mode from settings.
 * @param sendBinding - The configured send binding (the keymap `send` action).
 * @returns The hotkey binding string that should trigger send.
 */
export function resolveSendBinding(mode: 'enter' | 'modEnter', sendBinding: string): string {
  return mode === 'enter' ? 'enter' : sendBinding;
}

/** ARIA token names for the modifier keys, per the WAI-ARIA `aria-keyshortcuts` value format. */
const ARIA_MODIFIERS: Record<string, string> = {
  ctrl: 'Control',
  control: 'Control',
  meta: 'Meta',
  alt: 'Alt',
  shift: 'Shift',
};

/** Named (non-single-character) keys that `aria-keyshortcuts` spells out canonically. */
const ARIA_NAMED_KEYS: Record<string, string> = {
  enter: 'Enter',
  escape: 'Escape',
  esc: 'Escape',
  slash: '/',
  '/': '/',
};

/**
 * Convert a react-hotkeys-hook binding string into a WAI-ARIA `aria-keyshortcuts` value so a screen
 * reader can announce the shortcut a control duplicates. Unlike {@link formatBinding} (which humanizes
 * for the visible cheatsheet, e.g. `meta` to "Cmd"), this emits the ARIA-canonical token names:
 * modifiers map to `Control`/`Meta`/`Alt`/`Shift`, named keys to `Enter`/`Escape`/`/`, and any other key
 * is upper-cased (`n` to "N"). Comma-separated alternatives become the space-separated list ARIA uses for
 * multiple shortcuts. Pure, so it is trivially testable.
 *
 * @param binding - The raw binding, e.g. `'alt+n'` or `'ctrl+enter, meta+enter'`.
 * @returns The `aria-keyshortcuts` value, e.g. `'Alt+N'` or `'Control+Enter Meta+Enter'`.
 */
export function toAriaKeyShortcuts(binding: string): string {
  return binding
    .split(',')
    .map((chord) => chord.trim())
    .filter(Boolean)
    .map((chord) =>
      chord
        .split('+')
        .map((raw) => {
          const token = raw.trim().toLowerCase();
          return ARIA_MODIFIERS[token] ?? ARIA_NAMED_KEYS[token] ?? token.toUpperCase();
        })
        .join('+'),
    )
    .join(' ');
}

/** The per-token display map: lowercase react-hotkeys-hook token to a screen-reader-clean label. */
const TOKEN_LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  meta: 'Cmd',
  alt: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  escape: 'Esc',
  esc: 'Esc',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  '/': '/',
  // react-hotkeys-hook maps e.code through L() which strips key/digit/numpad and lowercases, so
  // the Slash key's code 'Slash' becomes the binding token 'slash'. Map it to '/' for display.
  slash: '/',
};

/** Humanize one `+`-joined chord, e.g. `shift+escape` to `Shift+Esc`. */
function formatChord(chord: string): string {
  return chord
    .split('+')
    .map((raw) => {
      const token = raw.trim().toLowerCase();
      return TOKEN_LABELS[token] ?? token.toUpperCase();
    })
    .join('+');
}

/** Whether a chord contains the given (lowercase) modifier token; normalizes case internally. */
function hasModifier(chord: string, modifier: string): boolean {
  return chord
    .toLowerCase()
    .split('+')
    .map((t) => t.trim())
    .includes(modifier);
}

/**
 * Humanize a react-hotkeys-hook binding string for the shortcuts cheatsheet. Within each
 * comma-separated alternative, tokens are mapped (`ctrl` to "Ctrl", `meta` to "Cmd", `alt` to "Alt",
 * `shift` to "Shift", `enter` to "Enter", `escape`/`esc` to "Esc", `/` kept, other keys upper-cased).
 * When the binding is a ctrl/meta PAIR (one alternative uses `ctrl`, another uses `meta` - the
 * cross-platform send chord), only the platform-appropriate one is shown: the Cmd chord on Mac, the
 * Ctrl chord elsewhere. Any other set of alternatives is joined with " or ". Pure: the platform is a
 * parameter, so there are no globals to stub.
 *
 * @param binding - The raw binding, e.g. `'ctrl+enter, meta+enter'` or `'shift+escape'`.
 * @param mac - Whether the current platform is macOS (the component detects this once).
 * @returns The humanized, screen-reader-clean binding string.
 */
export function formatBinding(binding: string, mac: boolean): string {
  const alternatives = binding
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const ctrlChord = alternatives.find((c) => hasModifier(c, 'ctrl'));
  const metaChord = alternatives.find((c) => hasModifier(c, 'meta'));
  if (ctrlChord && metaChord) {
    return formatChord(mac ? metaChord : ctrlChord);
  }
  return alternatives.map(formatChord).join(' or ');
}
