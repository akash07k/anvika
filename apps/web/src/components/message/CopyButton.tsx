import { notify } from '../../notifications/notifier';

/** Props for {@link CopyButton}. */
export interface CopyButtonProps {
  /** The text to copy to the clipboard (the raw message markdown source). */
  text: string;
  /** The button's accessible label (e.g. "Copy your message"). */
  label: string;
}

/**
 * A labelled button that copies `text` to the clipboard and announces the outcome through the
 * notification layer: `messageCopied` on success, `messageCopyFailed` (high priority) on rejection or
 * when the Clipboard API is unavailable - never silent (a silent failure reads as success to a
 * screen-reader user). The unavailable case is real for Anvika's self-hosted model: `navigator.clipboard`
 * is undefined on a non-secure origin (plain HTTP on a LAN address, not `localhost`/HTTPS), where
 * `navigator.clipboard.writeText` would otherwise throw synchronously before any promise rejects. The
 * confirmation is spoken, not focus-moving, so focus stays on the button.
 *
 * @param props - The text to copy and the button's accessible label.
 * @returns The copy button element.
 */
export function CopyButton({ text, label }: CopyButtonProps) {
  const onCopy = (): void => {
    const { clipboard } = navigator;
    if (!clipboard?.writeText) {
      notify({ type: 'messageCopyFailed' });
      return;
    }
    void clipboard.writeText(text).then(
      () => notify({ type: 'messageCopied' }),
      () => notify({ type: 'messageCopyFailed' }),
    );
  };
  return (
    <button type="button" aria-label={label} onClick={onCopy}>
      Copy
    </button>
  );
}
