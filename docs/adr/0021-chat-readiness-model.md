# ADR 0021: Chat readiness model and first-run gate

A pure `computeReadiness` function (wrapped by `useChatReadiness()`) resolves one of four
states - `loading`, `unconfigured`, `model-unavailable`, `ready` - and drives two distinct
UI responses: a welcome panel that replaces the chat surface when the app is truly
unconfigured, and a non-blocking notice with a disabled composer when a configured model is
temporarily unavailable. The gate is derived entirely from live settings and the models
query; no persisted first-run flag is needed.

## Context

The conversation surface must not drop a user into an unusable chat. "Configured enough to
chat" requires all three of: a non-empty `selectedModelId`, the owning provider credentialed
(a cloud `apiKey` set, or the model is `local`), and the selected model present in the live
available-models list.

Two tensions shaped the design:

- Hiding history on a transient outage (unreachable local server, removed key, wrong model
  id) is unacceptable - a screen-reader user navigating saved messages must not lose access
  because of a momentary network or config problem.
- A brand-new user who has never entered a key should see a friendly, actionable welcome
  rather than a broken composer that only errors on send.

A single "replace everything on any not-ready state" gate collapses these two into one,
which is wrong for both. A single "no gate, always show the composer" policy leaves the
first-run experience broken.

## Decision

A pure `computeReadiness(settings, modelsQuery)` function maps settings and the live models
query result to exactly one of four readiness states:

- `loading` - settings have not yet hydrated, or the models query is still on its first load.
- `unconfigured` - no model is selected AND no cloud key is configured. The app has never
  been set up.
- `model-unavailable` - the app is configured (a model is selected and a key exists or the
  model is local), but the selected model is not present in the current available-models
  list.
- `ready` - all three conditions are satisfied and the composer may accept input.

The `useChatReadiness()` hook wraps `computeReadiness` and subscribes to the Zustand
settings store and the TanStack Query models result, so the UI reacts automatically to any
credential or availability change.

UI consequences by state:

- `loading` - composer disabled, a brief polite status message shown to the user.
- `unconfigured` - the `WelcomePanel` component replaces the entire chat surface. No
  conversation history or composer is shown. The panel links directly to Settings.
- `model-unavailable` - conversation history remains visible and navigable. Composer is
  disabled. A `ChatReadinessNotice` appears with a plain-text explanation and a Settings
  link. The notice is non-live (not an ARIA live region) to avoid interrupting history
  navigation.
- `ready` - normal chat surface, composer enabled.

List membership in the available-models response is the authoritative `ready` signal. The
credential check (key present or provider is local) exists only to distinguish
`unconfigured` from `model-unavailable`, not to gate readiness itself.

Readiness is logged once at boot as the content-safe `chatReadinessResolved` diagnostic
event - a single enum value, no secrets, no settings content.

## Considered Options

- **Replace the chat surface on any not-ready state** - rejected. This would hide
  conversation history whenever a local server is temporarily unreachable or a key is
  rotated. A screen-reader user who navigates by heading through saved messages must not
  lose that access because of a transient outage.

- **No gate (prior behavior)** - rejected. Without a gate the composer is always present but
  only produces an error on send. A first-time user with no key configured gets no guidance
  and no actionable path forward. This is the experience the feature exists to fix.

- **Persisted `firstRunComplete` flag** - rejected. A boolean flag in settings adds
  persistent state that must be set, read, migrated, and kept consistent with the actual
  configuration. All of that is unnecessary: `unconfigured` is already derivable from
  settings and the models query with no extra storage. The welcome panel reappears correctly
  whenever the app is genuinely unconfigured (key removed, settings reset), which a one-time
  flag would prevent.

- **Credential check as the sole readiness gate (no list-membership check)** - rejected. A
  key can be present but invalid, or a local server can be unreachable. Treating "key exists
  or local" as sufficient for `ready` would allow the composer to submit requests that
  immediately fail. List membership provides the authoritative signal that the model is
  currently usable.

## Consequences

- A configured user is never locked out of their conversation history by a transient
  provider or local-server outage. The composer is disabled and a notice is shown, but the
  history remains fully navigable.
- The welcome panel reappears automatically whenever the app returns to a genuinely
  unconfigured state (for example, after a settings reset or key removal), with no manual
  flag to clear.
- One content-safe diagnostic event (`chatReadinessResolved`) is emitted at boot. No
  secrets, API keys, or settings values cross the log boundary.
- Implementing files: `apps/web/src/hooks/chat/useChatReadiness.ts`,
  `apps/web/src/components/WelcomePanel.tsx`,
  `apps/web/src/components/ChatReadinessNotice.tsx`,
  `apps/web/src/components/ConversationView.tsx`.
