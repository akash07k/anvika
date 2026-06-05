# Accessibility test fidelity: hybrid jsdom + Vitest Browser Mode

Accessibility-critical UI is verified in a real browser, not jsdom. We run a hybrid test setup:

- **jsdom** (fast) for pure logic and non-accessibility-critical components.
- A **Vitest Browser Mode** project (real Chromium, Firefox smoke) for the accessibility-critical surfaces: focus management, keyboard and quick-navigation, message ARIA structure, and the announce utility's real `document.ariaNotify` branch.
- **Playwright + axe** for full end-to-end flows.
- A **manual NVDA/JAWS pass** (plus VoiceOver/Safari for the aria-live fallback) as the only gate that confirms a screen reader actually speaks.

The last point is a hard constraint, not a preference: `ariaNotify` produces no DOM change, so no automated environment - jsdom or real browser - can observe whether a screen reader announced. Automated tests can assert that `document.ariaNotify` was called (spy) and can assert the aria-live fallback's DOM content; the spoken outcome is manual-only.

The Browser Mode project arrives with the accessibility layer, when the accessibility primitives first exist. The earlier groundwork uses jsdom because its only components are non-interactive (e.g. the static landmark shell).

We record this because a future reader seeing `jsdom` in the Vitest config might wrongly assume accessibility is verified there. It is not - jsdom green means logic is correct, not that the experience is accessible.
