# Radix DropdownMenu: opening under screen-reader Browse/Virtual mode

Context7 lookup (`/websites/radix-ui_primitives`, installed `radix-ui` 1.6.0), 2026-06-20.

## The problem

The Radix `DropdownMenu.Trigger` toggles the menu on `pointerdown` (mouse) and on `keydown`
(Enter / Space / Arrow when the trigger has real DOM keyboard focus). It does NOT toggle on a
plain `click`.

NVDA Browse mode and JAWS Virtual mode do not move real keyboard focus onto the button and do
not synthesize `pointerdown`/`keydown` when the user activates an element; they dispatch only a
single synthesized `click`. So activating the trigger from the virtual cursor never opens the
menu - the user must drop to Focus/Forms mode first. This reproduces in the official shadcn
demo, so it is the underlying Radix behavior, not our wrapper. It affects every shadcn
`DropdownMenu` in the app.

## What Context7 says is available

- `Trigger` API exposes only `asChild` plus the `[data-state]`/`[data-disabled]` data
  attributes. There is no newer prop or recommended setting to make Browse/Virtual-mode
  activation open the menu. No built-in fix exists in 1.6.0.
- `Root` supports the standard controlled/uncontrolled open API: `defaultOpen` (initial
  uncontrolled state), `open` (controlled), and `onOpenChange` (callback). This is the
  supported lever for opening the menu programmatically.

## The fix we apply

We open the menu on a `click` that was NOT preceded by a `pointerdown` on the trigger. A real
mouse click always fires `pointerdown` first (where Radix already opens the menu), so its
trailing `click` is ignored; a Browse/Virtual-mode activation dispatches only a bare `click`
with no preceding `pointerdown`, so that is what we open on.

We make the shared vendored `DropdownMenu` root controlled internally (seeded from `defaultOpen`,
deferring to a caller-supplied `open`), and on the `Trigger` we track pointerdowns with a ref:
`onPointerDown` sets the ref true (cleared on the next animation frame so a pointerdown without a
following click - a drag-away - does not leave it stuck), and `onClick` opens the menu only when
the ref is false (no preceding pointerdown) and the root is internally controlled. The real-mouse
path is untouched (its pointerdown set the ref, so the click is ignored - no double-toggle), and
keyboard Focus-mode is untouched (Radix's own `keydown` handling still runs).

We deliberately do NOT key off `event.detail`. An earlier version of this fix opened only when
`event.detail === 0`, on the assumption that a synthesized AT click carries a zero click-count.
That proved unreliable on real NVDA, which does not consistently synthesize `detail === 0`, so the
menu still failed to open. The pointerdown-tracking approach above is `event.detail`-agnostic and
works regardless of the click-count the screen reader supplies. The smoke and `MessageActionsMenu`
Browse-mode tests dispatch a click with `detail: 1` (NOT 0) to lock in that the fix does not depend
on `event.detail`.

Done once in `apps/web/src/components/ui/dropdown-menu.tsx` so every consumer
(`MessageActionsMenu`, conversation row menus, etc.) is fixed at the primitive level.
