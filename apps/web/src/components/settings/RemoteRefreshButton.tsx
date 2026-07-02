/** Props for {@link RemoteRefreshButton}. */
export interface RemoteRefreshButtonProps {
  /** The button's accessible label. */
  label: string;
  /**
   * Whether a refresh is in flight. Marks the button `aria-disabled` (keeping it focusable for
   * screen-reader and keyboard users) and sets `aria-busy`. The click handler is guarded so the
   * press action is a no-op while busy.
   */
  busy: boolean;
  /** Invoked when the button is pressed. */
  onPress: () => void;
  /**
   * Optional id of an element that describes the current remote state (for example a "last updated"
   * line). When set, it is wired as the button's `aria-describedby` so a screen reader reads that
   * freshness context as part of the button, making it reachable from the control itself.
   */
  describedBy?: string;
}

/**
 * A reusable "refresh from a remote source" button: shows `label`, marks itself `aria-disabled`
 * (keeping it focusable for screen-reader and keyboard users) and sets `aria-busy` while `busy`,
 * and calls `onPress` on click. Optionally points `aria-describedby` at a caller-owned status
 * line. Pure and presentational - the caller's store action owns the request and the screen-reader
 * announcements. Reused by the model-refresh feature.
 */
export function RemoteRefreshButton({
  label,
  busy,
  onPress,
  describedBy,
}: RemoteRefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!busy) onPress();
      }}
      aria-disabled={busy}
      aria-busy={busy}
      aria-describedby={describedBy}
    >
      {label}
    </button>
  );
}
