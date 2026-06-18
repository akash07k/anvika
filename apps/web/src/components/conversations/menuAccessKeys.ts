import type { KeyboardEvent } from 'react';

/** A map from a lowercase single-letter accelerator to the DOM id of the menu item it activates. */
export type MenuAccessKeyMap = Readonly<Record<string, string>>;

/**
 * Build an `onKeyDown` handler for a menu's content element that activates an item by its single-letter
 * accelerator. A bare matching letter is consumed (`preventDefault`) and the target item is activated by
 * a programmatic `click()` on its element - routing through Radix's own select-and-close, since
 * Radix `ContextMenu.Root` cannot be closed via an `open` prop. Any Ctrl/Meta/Alt combination is ignored
 * so the accelerators never shadow a browser or assistive-technology shortcut. Content-safe: keys and
 * element ids only; no conversation title or text is read or logged.
 *
 * @param map - Lowercase single-letter accelerators mapped to the DOM id of the item each activates.
 * @returns An `onKeyDown` handler to pass to the menu content element.
 */
export function createMenuAccessKeyHandler(map: MenuAccessKeyMap): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const id = map[event.key.toLowerCase()];
    if (!id) return;
    event.preventDefault();
    document.getElementById(id)?.click();
  };
}
