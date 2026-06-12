# Form validation errors are announced through the notification layer, not `role="alert"`

A rejected settings PATCH is surfaced through the event-driven notification layer (ADR 0013), not through an ARIA live region. On failure the settings store emits a `settingsSaveFailed` event - symmetric with the existing `settingsSaved` - and the speech channel announces it once at high priority. Each offending field's error is rendered as **non-live** text associated to its control via `aria-describedby` (no `role="alert"`); the global form summary is likewise a non-live, focusable element. So there is exactly one spoken source (the announce layer) plus durable, navigable detail in the DOM.

This completes ADR 0013 for the validation path. The field primitives' `error` rendered as `role="alert"` is an earlier affordance that predates the `announce()` utility; ADR 0013 already calls for removing such interim live regions in favor of the notifier, and we made the same choice for chat errors (announce speaks once; the visual error is non-live to avoid double-speak). This ADR records the same rule for form-field errors specifically, because the obvious instinct - reach for `role="alert"` on a form error - is exactly what we are deliberately not doing.

## Considered Options

- **Per-field `role="alert"`** (the existing affordance) - rejected. It double-speaks against any `announce()`, is inconsistent with ADR 0013 and our chat-error choice, and cannot re-announce an identical repeated error (an unchanged live region is silent on the next failure); the notifier's nonce path can.
- **A single global `aria-live` alert only** - rejected. Generic; it does not tell a screen-reader user which field was rejected.
- **Announce via the notifier + non-live `aria-describedby` field text (chosen)** - one reliable spoken source for the immediate notification, plus the exact per-field message discoverable on navigating to the control. Covers both "now" and "on return to the field" with no double-speak.

## Consequences

- `FieldShell` renders its `error` as non-live text associated via `aria-describedby` and no longer as `role="alert"`; `fields.test.tsx` asserts the association rather than the alert role.
- A new `settingsSaveFailed` notification event carries the message; the speech channel announces it at high priority. The store emits it on a failed PATCH and builds the field-error map (`path` to field id).
- The announcement names the field when one is identified: `"{field label}: {server message}"`; otherwise the global message. The global visual alert is shown only when no field maps (a per-field error suppresses the global one).
- Safe by construction: every settings commit is a single-field PATCH and the stored settings were already valid, so at most one field can be newly invalid - there is never a pile-up of competing field messages regardless of representation.
