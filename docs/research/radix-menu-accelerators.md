# Radix menu accelerator keys (ContextMenu / DropdownMenu)

Research backing the in-menu accelerator keys on the conversation context menu.
Source: Radix UI primitives docs via Context7 (`/radix-ui/website`,
`data/primitives/docs/components/context-menu.mdx` and `dropdown-menu.mdx`).

## What Radix gives us for free

- `ContextMenu` (and `DropdownMenu`) ship full keyboard navigation plus built-in **typeahead**:
  while the menu is open, typing a character focuses (highlights) the next item whose text
  starts with that character. Typeahead only *moves focus* to a matching item; it does not
  activate it. `Enter` / `Space` activates the highlighted item; `Escape` closes the menu and
  returns focus to the trigger; `ArrowUp` / `ArrowDown` / `Home` / `End` roam the items.
- `ContextMenu.Item` exposes `onSelect` (fired on activation) and `textValue` (overrides the
  string typeahead matches against).
- `ContextMenu.Root` is cursor-driven and has **no controllable `open` prop**, so a menu cannot
  be closed by toggling React state. Radix only mounts the *open* menu's content into the DOM;
  closed menus are unmounted. The supported way to activate an item and close the menu
  programmatically is to call `.click()` on the item's DOM element - that fires Radix's own
  `onSelect` and dismisses the menu.

## Composing a custom onKeyDown with typeahead

Our vendored `ContextMenuContent` spreads its remaining props onto
`ContextMenuPrimitive.Content`, so an `onKeyDown` passed to it reaches the primitive. React
attaches our handler to the same content element Radix uses; our handler runs during the normal
React event flow and we call `preventDefault()` on a bare matching letter. Because each
accelerator is the first letter of its own item label, even if Radix typeahead also reacted it
would merely highlight that one item - never activate another - so there is no harmful race. We
do **not** need `stopPropagation()`; consuming only the matched bare letter via `preventDefault`
is enough, and it leaves Arrow / Escape / Enter / non-accelerator typeahead untouched.

## Decisions for this app

- Bare single-letter accelerators (Pin `p` / Unpin `u`, Branch `b`, Rename `r`, Delete `d`).
  Any `Ctrl` / `Meta` / `Alt` combination is ignored so the accelerators never shadow a browser
  or assistive-technology shortcut.
- Each item carries `aria-keyshortcuts` (the uppercase letter) for screen readers, and shows the
  letter visually via `ContextMenuShortcut`. The visual span is marked `aria-hidden` so the
  accessible name stays just "Pin" / "Branch" / "Rename" / "Delete" and the SR is not told the
  shortcut twice.
- Known assumption: the accelerator letters and their `aria-keyshortcuts` are Latin/QWERTY. The
  handler matches `event.key.toLowerCase()`, so the access keys are reliable on US-style layouts; a
  non-Latin layout where the labelled letter is not directly typeable would not get the in-menu
  shortcut (the menu is still fully operable by arrow keys, typeahead, and Enter). Acceptable for
  now; revisit if internationalised keymaps land.
