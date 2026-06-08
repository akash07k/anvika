# Screen-reader focus management for jump-to-message shortcuts

Research findings for Anvika's keyboard shortcuts that move focus to a chat message so the
user can read it. Primary tester: NVDA on Chrome and Firefox/Windows. Research only, no code
changes. All claims cited inline.

## TL;DR (the verdict)

1. Focusing a bare `<h2 tabindex="-1">` is the W3C-blessed pattern and works for most users,
   but it has a documented, real failure mode on NVDA: it only reliably moves the reading
   position when the NVDA setting **"Focus follows the virtual cursor" / "Browse mode follows
   focus"** is on (it is on by default, but users disable it). When a user has it off, system
   focus moves but the browse-mode reading cursor does NOT follow, so nothing is announced.
   That single setting is the most likely explanation for the reported symptom.
2. The user's proposed labeled-region approach (`role="region"`/`group`/`article` +
   `aria-label` + `tabindex="-1"`, focus the wrapper) is **NOT a reliable fix and can make
   things worse**. There is a closed NVDA bug (#12084) showing that wrapping the focus target
   in `role="group"` + a name causes NVDA browse mode to announce *nothing* on programmatic
   focus, where the un-wrapped version announced correctly. Region-per-message also pollutes
   landmark navigation (APG explicitly warns against landmark overuse).
3. The robust answer is **not a single DOM trick - it is "focus + announce" combined**: move
   focus to the heading for caret/navigation position, AND fire an explicit announcement
   (`document.ariaNotify` or an aria-live region) so the user hears something regardless of
   the browse-mode-follows-focus setting. This is exactly what the most-tested SPA teams
   (Gatsby/Fable, TPGi) landed on after user testing. Anvika already has a working
   announce path - reuse it as the load-bearing channel and treat focus as positioning.

## Is focusing a `tabindex="-1"` heading reliable? Why might NVDA not follow it?

**It is the recommended pattern, but it is not unconditionally reliable on NVDA.**

The pattern itself is legitimate and endorsed. Adrian Roselli: moving focus to a
non-interactive element such as a heading "is legitimate so long as the element is not made
user-focusable, using a tabindex value of -1 to allow focus via JavaScript without placing it
in focus order," and for screen-reader users "focus should be moved to something with an
accessible name and appropriate role"
([Adrian Roselli, Dialog Focus in Screen Readers](https://adrianroselli.com/2020/10/dialog-focus-in-screen-readers.html);
[Where to Put Focus When Opening a Modal Dialog](https://adrianroselli.com/2025/06/where-to-put-focus-when-opening-a-modal-dialog.html)).
A heading has both a role (heading, level 2) and an accessible name (its text), so it
satisfies that bar.

**Documented NVDA failure modes:**

- **Browse mode does not follow programmatic focus in some configurations / DOM positions.**
  [NVDA issue #12084 "NVDA browse mode doesn't recognize focus function in some situations
  with chrome browser"](https://github.com/nvaccess/nvda/issues/12084) is the closest match to
  the reported symptom: a script moves focus, DOM focus moves, but "NVDA says nothing." It
  reproduced specifically when the focus target was among the **last elements in the DOM** or
  was **wrapped in a `div` with `role="group"` and `aria-labelledby`**. (Closed as
  not-planned/invalid, but it documents the behavior.) Chat messages appended at the bottom of
  a transcript are exactly the "last elements in the DOM" case.
- **aria-hidden siblings suppress the announcement.** If anything around the focus target is
  `aria-hidden="true"`, NVDA may say nothing when focus lands
  ([NVDA issue #5825](https://github.com/nvaccess/nvda/issues/5825)).
- **Inconsistent recognition of `tabindex=-1` on containers** in browse mode
  ([NVDA issue #11820](https://github.com/nvaccess/nvda/issues/11820)).
- **Firefox is weaker than Chrome here.** Roselli's cross-SR table shows NVDA announcing a
  focused container in Chrome but, **in Firefox, announcing surrounding content instead of the
  focus target** - "NVDA and Firefox produce inconsistent results"
  ([Dialog Focus in Screen Readers](https://adrianroselli.com/2020/10/dialog-focus-in-screen-readers.html)).
  This matters because the tester uses both Chrome and Firefox.

So: a heading is the right *target*, but `.focus()` alone leans on NVDA's browse-mode-follows-
focus behavior, which is configuration- and context-dependent.

## NVDA browse mode vs focus mode, and the reliable way to relocate the reading position

NVDA's reading position in web content is the **browse mode "virtual cursor" / virtual
buffer** - a flat text representation navigated with arrow keys, independent of the system
focus ([Browse Mode, NVDA](https://www.mintlify.com/nvaccess/nvda/features/browse-mode);
[NVDA 2025.3 User Guide](https://download.nvaccess.org/releases/2025.3.2/documentation/userGuide.html)).
System focus and the virtual cursor are two separate cursors.

**The key mechanism (this is the smoking gun for the bug):** whether moving system focus drags
the virtual cursor (and triggers an announcement) is governed by an NVDA setting. The
navigator/review cursor "moves along with the System focus" **by default, but this behaviour
can be toggled on and off**, and there is a browse-mode preference **"Focus follows the
virtual cursor"** plus its inverse (browse mode following focus)
([NVDA User Guide](https://download.nvaccess.org/releases/2025.3.2/documentation/userGuide.html);
[Tink - Understanding screen reader interaction modes](https://tink.uk/understanding-screen-reader-interaction-modes/)).
NVDA auto-switches to focus mode when focus lands on a control that *requires* it (form field,
listbox), but **not** for a plain heading - a heading does not trigger a mode switch, so the
user stays in browse mode and depends entirely on the "browse mode follows focus" behavior to
hear anything ([NVDA User Guide](https://download.nvaccess.org/releases/2025.3.2/documentation/userGuide.html)).

Consequences:

- If the user (or a profile) has "browse mode follows focus" off, `.focus()` on a heading
  moves system focus silently - exactly the reported "everything that MOVES FOCUS fails."
- Even with it on, the announcement is NVDA reading whatever is at the new focus, which #12084
  shows can be empty depending on DOM position / wrapping.

**Reliable JS ways to relocate an NVDA user's reading position:**

- The most robust is **not to rely on the browse cursor following focus at all** - fire an
  explicit announcement (ariaNotify / aria-live) so content is spoken regardless of the
  setting, and move focus so subsequent arrow-key reading starts at the right place. (Focus
  positions the caret; the announce guarantees speech.) This is the dual focus-and-announce approach.
- Focusing an element that forces focus mode (e.g. a control) would announce more reliably but
  is the wrong UX for "read this message."
- There is no public stable JS API to set NVDA's virtual cursor directly; you influence it
  only via system focus + the follows-focus setting, or via live regions.

## The labeled-region / landmark approach - focus the wrapper instead of the heading (verdict)

**Verdict: Do not adopt region-per-message as the fix. It is not more reliable than the
heading on NVDA, it has a documented regression, and it has navigation side effects.**

Evidence against:

- **Direct regression.** [NVDA #12084](https://github.com/nvaccess/nvda/issues/12084): wrapping
  the focus target in `role="group"` + a name made NVDA announce **nothing** on programmatic
  focus, whereas the same content un-wrapped announced correctly. So a labeled group/region
  wrapper is, in at least one documented case, *worse* than a bare focus target - the opposite
  of the hoped-for effect.
- **Firefox inconsistency.** Roselli's testing shows focusing a labeled container is announced
  reliably mainly in **JAWS and Safari/VoiceOver**, while **NVDA + Firefox** tends to announce
  surrounding content rather than the container's name
  ([Dialog Focus in Screen Readers](https://adrianroselli.com/2020/10/dialog-focus-in-screen-readers.html)).
  A labeled container is therefore *not* a reliable cross-browser upgrade for this app's
  Chrome+Firefox target.
- **Landmark dilution.** A `role="region"` with a name *is* a landmark
  ([Scott O'Hara, Accessible Landmarks](https://www.scottohara.me/blog/2018/03/03/landmarks.html)),
  and modern NVDA does support region landmarks
  ([Adam Liptrot, NVDA landmarks](https://liptrot.org/guides/nvda/landmarks/)). But the APG and
  TPGi are explicit that **landmarks are for major page sections and overuse dilutes their
  value** - "avoid using too many landmark regions ... too many of them can make it tedious to
  cycle among them"
  ([APG, Landmark Regions](https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/);
  [TPGi, Improving access to landmark navigation](https://www.tpgi.com/improving-access-to-landmark-navigation/)).
  One region per chat message turns the D-key / landmark list into noise.
- **No APG endorsement of region-per-item for this purpose.** The APG focus-management guidance
  ([Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/))
  covers `tabindex="-1"` and `element.focus()` and `aria-activedescendant`, but does not
  propose wrapping content items in labeled landmarks to make focus announce.

Nuance worth keeping: the *reason* the region idea sounds appealing - "focus something that has
a strong accessible name so NVDA speaks it" - is sound (Roselli: focus a thing "with a useful
accessible name" and a role). But the **heading already provides name + role**, so the wrapper
adds risk (the #12084 regression, landmark dilution, Firefox flakiness) without adding a name
the heading doesn't already have. If a wrapper is ever used, prefer `role="article"`/`group`
(NOT a landmark, so no landmark-list pollution - note JAWS 2018+ and current NVDA do not treat
`article` as a landmark per Scott O'Hara), and still pair it with an explicit announcement.

## Robust techniques to move SR focus to content, ranked by reliability (NVDA-weighted)

Ranked most-likely-to-work first for the Anvika case (Chrome + Firefox, NVDA primary,
non-interactive heading target).

1. **Focus the heading AND fire an explicit announcement (the dual approach).** Highest
   reliability. The announcement (ariaNotify, or a polite/assertive aria-live region) guarantees
   speech independent of NVDA's "browse mode follows focus" setting and of DOM-position quirks;
   the `.focus()` positions the virtual caret so arrow-key reading continues from the message.
   This is precisely what Gatsby + Fable Tech Labs adopted after **user testing**, "because
   NVDA with Firefox and VoiceOver with Safari don't always reliably announce focused elements"
   ([Dave Rupert, Accessible Page Navigations in SPAs](https://daverupert.com/2019/01/accessible-page-navigations-in-single-page-apps/),
   citing the Gatsby/Fable testing; reinforced by
   [TPGi, Single Page Applications](https://www.tpgi.com/single-page-applications/) and the
   [OneUptime React focus-management guide](https://oneuptime.com/blog/post/2026-01-15-focus-management-react-spa/view),
   which both pair focus with a `role="status" aria-live` region).

2. **Ensure the heading has a clean role + accessible name and is NOT surrounded by
   `aria-hidden`.** Necessary precondition for 1 to announce well. A focus target must have an
   accessible name and an appropriate role to be announced
   ([Adrian Roselli](https://adrianroselli.com/2020/10/dialog-focus-in-screen-readers.html));
   `aria-hidden` siblings suppress the announcement
   ([NVDA #5825](https://github.com/nvaccess/nvda/issues/5825)).

3. **Defer the `.focus()` to after render/paint (setTimeout ~50-100 ms, or double
   requestAnimationFrame), not synchronously inside the keydown handler.** Ensures the element
   is actually in the DOM and rendered before focusing, and avoids racing the keydown.
   Tested SPA guides use a ~100 ms `setTimeout` "to ensure content has rendered" before
   focusing the target with `tabindex="-1"`, and ~50 ms for modals
   ([OneUptime](https://oneuptime.com/blog/post/2026-01-15-focus-management-react-spa/view);
   [CSS-Tricks, How We Improved the Accessibility of Our SPA Menu](https://css-tricks.com/how-we-improved-the-accessibility-of-our-single-page-app-menu/)).
   See the section on synchronous versus deferred `.focus()` for the keydown-specific reasoning.

4. **`scrollIntoView()` before focus when the target is in a scroll container.** Browse-mode
   announcement and reliable focus assume the element is rendered/visible; scrolling it into
   view first avoids virtualization / off-screen edge cases. (General SPA guidance; combine
   with the deferral in 3.)

5. **`aria-activedescendant` on a focused composite container.** APG-supported and very reliable
   *when the UI is a single managed composite widget* ("when the container element receives DOM
   focus, draw a visual focus indicator on the active element and ensure the active element is
   scrolled into view" -
   [APG keyboard interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)).
   Powerful but a heavier re-architecture: the transcript becomes one focusable widget with a
   roving active descendant rather than independently-focusable headings. Worth considering for
   quick-nav specifically; overkill if the dual approach in 1 already solves it.

6. **Focus a labeled container/region wrapper instead of the heading.** LOW reliability for this
   stack - see the labeled-region verdict above. Announces in JAWS/VoiceOver, flaky in NVDA+Firefox, documented to *suppress*
   announcement in one NVDA case (#12084), and pollutes landmarks if `role="region"`. Not
   recommended.

7. **Live-region announce only, no focus move.** Reliable for *speech* (the app already proves
   this works), but it does NOT relocate the browse caret, so the user can't then arrow through
   the message from that point. Good for "notify," insufficient for "go read this." Use as the
   speech half of the dual approach, not alone, when the goal is to relocate reading position.

## React/SPA pitfalls that break programmatic focus

- **Remount on `key` change.** If the message element's React `key` changes on re-render, React
  unmounts and remounts a fresh DOM node; any focus you set on the old node is lost. Keep keys
  stable (message id), and never key on array index or on streaming-content hashes.
- **StrictMode double-invoke / focus restoration.** In dev, StrictMode mounts, destroys, and
  re-creates effects; focus set or restored in an effect/cleanup can be clobbered, and "focus
  won't be restored back when the component mounts again"
  ([React issue #25979, Strict effects can break focus restoration](https://github.com/facebook/react/issues/25979);
  [React StrictMode docs](https://react.dev/reference/react/StrictMode)). Symptom is dev-only
  but masks real bugs - verify with StrictMode behavior in mind.
- **Element not yet in the DOM / not yet rendered** when `.focus()` runs (streaming message
  still mounting, or focus fired before commit). Defer with setTimeout/rAF (see the deferral guidance below).
- **An aria-live region updating at the same moment can announce over / race the focus** - and
  conversely a focus-triggered announcement can stomp a live-region message. The live region
  must already exist in the DOM *before* it is populated, and content should be injected after
  a tick; `aria-relevant`/`aria-atomic`/`aria-busy` support is inconsistent across SR+browser
  pairings ([Sara Soueidan, Accessible notifications with ARIA Live Regions](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/)).
  If using both a heartbeat live region and a jump announcement, sequence them so they don't
  collide.
- **Scroll containers / virtualization** can leave the target off-screen or unmounted; ensure
  it's rendered and `scrollIntoView` first (technique 4 above).
- **Caching focusable elements on mount** then focusing a stale reference after the list
  changed - query the target at action time, not from a mount-time cache
  ([OneUptime](https://oneuptime.com/blog/post/2026-01-15-focus-management-react-spa/view)).

## Synchronous `.focus()` in a keydown handler (with default prevented) vs deferring it

Prefer **deferring** the focus call (a 0-100 ms `setTimeout`, or `requestAnimationFrame` /
double-rAF) rather than calling `.focus()` synchronously inside the keydown handler.

Reasons, with evidence:

- The element is reliably in the DOM and rendered after a tick; React may not have committed the
  relevant render yet at keydown time, and tested SPA implementations explicitly use a small
  `setTimeout` "to ensure content has rendered" before focusing
  ([OneUptime](https://oneuptime.com/blog/post/2026-01-15-focus-management-react-spa/view);
  [CSS-Tricks SPA menu](https://css-tricks.com/how-we-improved-the-accessibility-of-our-single-page-app-menu/)).
- Deferring decouples the focus move from the in-flight key event so the screen reader isn't
  processing the keystroke and a focus change in the same synchronous turn; the same deferral
  pattern is standard for moving focus to error summaries / first error field
  (`setTimeout(focusFirstError, 100)`)
  ([Alex Bostock, Lessons about React keyboard input/events](https://alexbostock.medium.com/lessons-about-react-keyboard-input-forms-event-listeners-and-debugging-e79016c20ef1)).
- `setTimeout` is the right primitive for *focus* timing; `requestAnimationFrame` is tuned to
  paint and is better for visual work - though a double-rAF (wait for the next paint, then
  focus) is a reasonable alternative when you need the node laid out first
  ([OneUptime](https://oneuptime.com/blog/post/2026-01-15-focus-management-react-spa/view);
  [requestAnimationFrame vs setTimeout](https://blog.openreplay.com/requestanimationframe-settimeout-use/)).

Do keep `preventDefault()` on the shortcut keydown (so the browser doesn't also act on the
key), but perform the actual `.focus()` in the deferred callback, not in the synchronous
handler body.

## Specific recommendation for Anvika's jump-to-heading shortcuts

1. **Keep the `<h2 id tabindex="-1">` heading as the focus target.** It already has the right
   role + accessible name; do not wrap each message in a `role="region"` (landmark dilution +
   #12084 regression + Firefox flakiness). If grouping is ever needed for other reasons, use a
   non-landmark `role="article"`/`group`, never `region`, and never rely on it for the
   announcement.
2. **Make the announcement the load-bearing channel, focus the positioning channel.** On
   jump-to-latest / quick-nav, both: (a) call `element.focus()` on the heading to move the
   caret, and (b) fire an explicit `document.ariaNotify` (with the existing aria-live fallback)
   announcing the message (e.g. the heading text / a short descriptor). This is the
   user-tested dual approach and is robust to NVDA's "browse mode follows focus" setting being
   off - which is the most probable cause of the current failure.
3. **Defer the focus** with a `setTimeout(..., 0-100ms)` (or double-rAF) out of the keydown
   handler; keep `preventDefault()` on the shortcut but focus in the deferred callback.
4. **Audit for the #12084 / #5825 triggers:** no `aria-hidden` on or around the message
   subtree, no `role="group"`/`region` wrapper with a name sitting between focus and content,
   and confirm the heading isn't the very last DOM node with nothing after it (a sentinel or
   the composer after the transcript helps).
5. **Stabilize React keys** on messages (message id, never index/content-hash) so a streaming
   re-render doesn't remount and drop focus; query the target at shortcut time rather than from
   a mount cache.
6. **Verification:** the isolated Chromium harness proving DOM focus moves is necessary but not
   sufficient - it cannot show what NVDA speaks. Test the real failure with NVDA on both Chrome
   and Firefox, and specifically toggle NVDA's "browse mode follows focus" setting off to
   confirm the dual approach still announces. (Roselli, TPGi, and Gatsby/Fable all converge on
   "test with the actual SR + browser pairings; focused elements are not always announced.")

## Sources

- [Adrian Roselli - Dialog Focus in Screen Readers](https://adrianroselli.com/2020/10/dialog-focus-in-screen-readers.html)
- [Adrian Roselli - Where to Put Focus When Opening a Modal Dialog](https://adrianroselli.com/2025/06/where-to-put-focus-when-opening-a-modal-dialog.html)
- [W3C APG - Developing a Keyboard Interface](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
- [W3C APG - Landmark Regions](https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/)
- [NVDA issue #12084 - browse mode doesn't recognize focus function (Chrome)](https://github.com/nvaccess/nvda/issues/12084)
- [NVDA issue #11820 - browse mode and tabindex=-1 in a div container](https://github.com/nvaccess/nvda/issues/11820)
- [NVDA issue #5825 - focus not announced when neighbors are aria-hidden](https://github.com/nvaccess/nvda/issues/5825)
- [NVDA issue #3741 - region landmark recognition](https://github.com/nvaccess/nvda/issues/3741)
- [NVDA 2025.3 User Guide - Browse mode / focus settings](https://download.nvaccess.org/releases/2025.3.2/documentation/userGuide.html)
- [NVDA Browse Mode docs](https://www.mintlify.com/nvaccess/nvda/features/browse-mode)
- [Léonie Watson (Tink) - Understanding screen reader interaction modes](https://tink.uk/understanding-screen-reader-interaction-modes/)
- [Dave Rupert - Accessible Page Navigations in Single Page Apps (Gatsby/Fable testing)](https://daverupert.com/2019/01/accessible-page-navigations-in-single-page-apps/)
- [TPGi - Single Page Applications](https://www.tpgi.com/single-page-applications/)
- [TPGi - Improving access to landmark navigation](https://www.tpgi.com/improving-access-to-landmark-navigation/)
- [OneUptime - Focus Management in React SPAs](https://oneuptime.com/blog/post/2026-01-15-focus-management-react-spa/view)
- [CSS-Tricks - How We Improved the Accessibility of Our SPA Menu](https://css-tricks.com/how-we-improved-the-accessibility-of-our-single-page-app-menu/)
- [Sara Soueidan - Accessible notifications with ARIA Live Regions (Part 1)](https://www.sarasoueidan.com/blog/accessible-notifications-with-aria-live-regions-part-1/)
- [Scott O'Hara - Accessible Landmarks](https://www.scottohara.me/blog/2018/03/03/landmarks.html)
- [Adam Liptrot - NVDA landmarks](https://liptrot.org/guides/nvda/landmarks/)
- [React issue #25979 - Strict effects can break focus restoration](https://github.com/facebook/react/issues/25979)
- [React - StrictMode reference](https://react.dev/reference/react/StrictMode)
- [Alex Bostock - Lessons about React keyboard input, events, debugging](https://alexbostock.medium.com/lessons-about-react-keyboard-input-forms-event-listeners-and-debugging-e79016c20ef1)
- [requestAnimationFrame vs setTimeout](https://blog.openreplay.com/requestanimationframe-settimeout-use/)
