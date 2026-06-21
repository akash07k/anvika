# shadcn/ui (Radix) is the UI primitive foundation; native dialogs migrate to it

Anvika originally hand-rolled a native HTML `<dialog>` base (`Dialog`, `ConfirmDialog`,
`KeyboardShortcutsDialog`) as an interim simplification. Two forces now make adopting the originally
locked shadcn/ui foundation worthwhile. First, the upcoming per-message actions (branch,
edit, regenerate) need a real menu primitive, and the later rich model picker needs a
combobox/autocomplete, neither of which native HTML provides. Second, the native `<dialog>` lets Tab
reach the browser chrome in practice (a focus-trap weakness observed in testing), which Radix's
JavaScript focus scope fixes. The project vision locked shadcn/ui (Radix) from the start, "vendored
into the repo so we own and harden every ARIA detail"; the native dialog was always a stopgap.

The decision: adopt shadcn/ui (Radix-based, vendored via the official CLI) as the UI primitive
foundation, migrate the three native dialogs to shadcn's defaults, and ship a single light theme.

Rationale: Radix provides focus trapping, ARIA, and keyboard navigation, the hardest part of
screen-reader support, as audited primitives we copy into the repo and can harden ourselves. Tailwind
v4 is already configured in `apps/web`, so `init` only adds the token layer, the `cn()` util, and
`components.json`. There was no formal ADR pinning the native dialog, so nothing is being overturned
on the record, only an interim simplification.

## Considered Options

- **Keep hand-rolling native primitives (rejected):** native HTML has no menu element, so the
  per-message actions and the model-picker combobox would be bespoke; and the native `<dialog>`
  focus-escape would have to be patched by hand. Reinventing accessible primitives is precisely what
  shadcn/Radix already provides, vendored and editable.
- **Adopt shadcn but port all the native hardening (rejected):** the bespoke native hardening
  (double-click guard, manual focus capture and restore, the no-`alertdialog` avoidance, the
  single-announce `aria-describedby` trick) patched native-`<dialog>` limitations and is largely not
  applicable to Radix. Porting it is wasted effort and a poor fit. Use shadcn's defaults and fix
  selectively only if a real screen-reader issue surfaces.
- **Adopt shadcn with defaults, vendor-and-harden, single light theme (chosen):** the minimal,
  audited path that unblocks menus and dialogs now and the model-picker combobox later.

## Consequences

- Official scaffolding only: `bunx --bun shadcn@latest init` for Vite + Tailwind v4, confirmed
  against current docs via Context7 at implementation time. Components live in
  `apps/web/src/components/ui/` and are owned in-repo.
- Primitives are added where the near-term features need them (Button, DropdownMenu, Dialog,
  AlertDialog); the foundation PR does not restyle every existing native button app-wide.
- `ConfirmDialog` becomes shadcn AlertDialog (whose default focus lands on Cancel, the WAI-ARIA
  alertdialog pattern); `KeyboardShortcutsDialog` and the base modal become shadcn Dialog. Behavioral
  tests that still apply are carried over (Escape closes, focus returns, title labels the dialog);
  native-specific hardening tests are dropped; one manual NVDA/JAWS/VoiceOver pass is required before
  the work is considered complete.
- Single visual theme: the `.dark` token block and any dark-mode toggle are dropped; no theme
  switcher (consistent with the screen-reader/keyboard-only audience). `prefers-reduced-motion` is
  already handled globally by a rule in `styles.css` that neutralizes animation and transition
  durations, which covers any `tw-animate-css` shadcn pulls in.
- This reverses the interim "native dialog, no Radix" stance, which carried no ADR.
