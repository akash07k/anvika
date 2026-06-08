# Manual Screen Reader Test Plan

This document is the manual screen-reader gate that complements the automated axe checks
run by the Playwright smoke test. Run this checklist before marking a release of work done.
The automated axe pass is a prerequisite - do not run this plan if axe is still failing.

## Screen reader support matrix

- NVDA + Firefox (latest) on Windows - primary target; all items below must pass here
- NVDA + Chrome (latest) on Windows - secondary; cover at minimum at each release boundary
- JAWS + Chrome (latest) on Windows - secondary; cover at minimum at each release boundary
- VoiceOver + Safari (latest) on macOS - secondary; cover at minimum at each release boundary

## Foundation shell checklist

Start from a fresh page load (`http://localhost:3000` by default).

### Document basics

- The browser tab title reads "Anvika" (verify via NVDA window title or browser title bar).
- The page `lang` attribute is `en`; the screen reader reads content in English without
  switching language voice unexpectedly.

### Skip link

- The first Tab press from page load focuses the "Skip to main content" skip link; it
  should be announced clearly.
- Activating the skip link (Enter or Space) moves focus into the `<main>` landmark region,
  bypassing the header.
- The skip link is not visible until focused (visually hidden, not display:none) - confirm
  it appears on focus and disappears on blur for sighted testers supporting keyboard-only
  users.

### Landmarks

- Navigate by landmark (NVDA: Insert+F7 landmarks list; JAWS: semicolon; VoiceOver: rotor).
- The following landmarks are present and announced:
  - `banner` (the page header)
  - `main` (the chat region)
  - `contentinfo` (the page footer)
- No unexpected duplicate `main` or `banner` landmarks.

### Heading navigation

- Press H (or Shift+H for reverse) in NVDA/JAWS browse mode to navigate headings.
- A heading "Chat" (or equivalent level-1 page heading) is present and reachable.
- Heading level hierarchy is logical - no skipped levels (e.g., h1 followed immediately by
  h3).

### Keyboard operation and focus

- Tab order is logical from top to bottom: skip link, then main content interactive
  elements.
- No keyboard trap - pressing Tab repeatedly eventually cycles back to the browser chrome
  or top of page; pressing Shift+Tab reverses without getting stuck.
- All interactive elements (links, buttons, inputs) are reachable by Tab and activatable
  by Enter or Space as appropriate.
- Focus indicator is visible at all times on focused elements (visible for sighted keyboard
  users; not specifically a SR concern but checked here for completeness).

### General announcements

- Navigation between areas does not produce spurious or repetitive announcements.
- No elements read as unlabelled (e.g., no "button" without an accessible name).

## Core chat surface - minimal streaming checklist

A fast smoke pass over the core streaming chat surface, before the fuller checklist below.
Verify on at least one screen reader (NVDA or JAWS on Windows). Requires a configured `.env`
(see `.env.example`).

- [ ] The page exposes a single `Conversation` heading inside the main landmark.
- [ ] The composer is reachable by keyboard and announced with its `Message` label.
- [ ] Typing a message and activating `Send` by keyboard submits it.
- [ ] A streamed assistant reply appears and its text can be read on demand.
- [ ] Each message is reachable as a heading (`You` / `Assistant`) for heading navigation.
- [ ] The `Send` button is disabled while a response is streaming and re-enabled after.
- [ ] With `.env` absent, sending surfaces the `unconfigured` message as an alert.
- [ ] No keyboard trap; focus order is composer then send.

## Core chat surface checklist

Run this after the foundation shell checklist. It covers the full single-conversation surface
(chat, reasoning, settings, connections). Each item should read and operate cleanly on at least
the primary SR (NVDA + Firefox); cover the secondaries at the release boundary.

### Composer and sending

- The message box has an accessible name ("Message") and is reachable by Tab.
- Sending works in the configured send-key mode: default Ctrl or Cmd plus Enter sends, Enter
  inserts a newline; the alternate mode (Enter sends, Shift plus Enter newline) is reachable.
- Alt plus Enter toggles the send-key mode and the change is announced.
- Sending an empty composer speaks a "type a message" notice rather than doing nothing silently.

### Streaming announcements

- On send, "Generating response" is announced once, then an elapsed "Generating, N seconds"
  roughly every two seconds, then "Response complete".
- A reasoning model announces the thinking phase ("Thinking, N seconds") and the transition
  ("Thought for N seconds. Answering.") exactly once per turn.
- Focus-on-completion: in the default "keep" mode focus stays in the composer; in "move" mode
  focus lands on the latest response heading. The body is not auto-read unless read-on-complete
  is enabled.

### Messages, headings, copy

- Each message is a heading and is reachable by heading navigation (H key) in logical order.
- Each user and assistant message has a Copy button with a clear accessible name; activating it
  announces "Message copied".
- Incomplete or streaming markdown reads cleanly (no raw or dangling markup spoken).

### Quick navigation and jumps

- Alt plus 1 through Alt plus 0 address the last ten messages (Alt plus 1 most recent); a single
  press reads per the configured mode (descriptor or full); a double press focuses the message.
- Alt plus A focuses the latest response, Alt plus U the latest user message, Alt plus C the
  composer (and speaks "already in the message box" when it already has focus).
- Shift plus Escape stops a generation; with nothing generating it speaks a no-op notice.

### Reasoning controls

- The Thinking disclosure region is reachable; its summary reads "Thinking" with the reasoning
  token count and duration when known; its Copy thinking button works. Reasoning text is only
  read on demand, never auto-announced.
- The composer "Thinking effort" combobox is labelled and operable; when the active model cannot
  reason it stays present but disabled and reads "This model does not support thinking".
- Alt plus T toggles thinking and announces the resolved effort ("Thinking off" or "Thinking,
  low/medium/high") on every press, with no double-speak from the combobox.
- Alt plus R focuses the latest assistant turn's Thinking region, or speaks "No thinking on the
  latest message" when there is none.

### Errors

- A generation error is announced once (not via a duplicate role=alert) and focus moves to Retry,
  or to the Settings link when no model is configured.

### Settings and connections

- Every settings field has an accessible name; saving announces "Settings saved"; a reload and a
  degraded-load both announce appropriately.
- Connections: Add, Edit, and Remove (with its confirm dialog) are reachable and clearly named.
- Opening Add or Edit reveals a labelled region landmark ("Add connection", or "Edit" plus the
  connection name); navigating by landmark announces entering and leaving that region, so the
  inline form's boundary is clear and does not blend into the connections list.
- Each connection's Active checkbox announces its connection (for example "Active Venice"), not a
  bare "Active", so rows are distinguishable; toggling announces activated or deactivated.
- Test connection announces start, slow-running, and the outcome (OK with model count, or the
  failure category); the key indicator reads Set or not set (never the secret).
- The per-connection "Thinking effort" select and the "Send extended thinking parameters" toggle
  (OpenAI-compatible only) are labelled, and the toggle's help text is associated.
- The keyboard shortcuts dialog (Alt plus slash) lists the shortcuts, including Toggle thinking and
  Jump to the latest thinking.

### Global

- No control reads as unlabelled; landmarks (banner, main, contentinfo) and the skip link work.
- prefers-reduced-motion is respected (no essential motion-only feedback).

## Rich model picker surface checklist

Run this after the core chat surface checklist. It covers the searchable model picker, the dialog
initial-focus standard, and composer focus after navigation. Cover at least NVDA plus Firefox.

### Model picker (Settings, the "Model" field)

- The trigger is a button named "Model" that also speaks the currently selected model (for
  example "Model Claude Sonnet (Anthropic)") and its collapsed or expanded state, so the current
  selection is audible without opening the list.
- Opening it (Enter or Space) moves focus into a "Search models" combobox; typing filters across
  model, connection, and provider names; the first matching result is the active option and is
  announced, so Enter selects it without arrowing.
- Arrow keys move the active option, Enter selects, and Escape closes and returns focus to the
  trigger.
- Options are grouped by connection, with a group heading per connection.
- The "Connection" select narrows the list to one connection; changing it clears any typed query;
  the result-count cue ("N models", or "N models from" a named connection) is reachable as the
  trigger's description.
- The "No models match" message reads when a query matches nothing.
- While the models list is loading, the trigger is disabled and reads "Loading models"; with no
  connection configured it reads the add-a-connection guidance (not the loading text).
- Decision to record during the pass: is the active-option speech on filter sufficient, or should
  the result count also be announced on each filter change (the spec's documented debounced
  result-count announcement fallback)? Note the verdict so we can implement the fallback if needed.

### Dialog initial focus (title-focus standard)

- Opening the Keyboard shortcuts dialog (Alt plus slash) moves focus to its "Keyboard shortcuts"
  title (read first), not to a footer button; Escape closes and restores focus to the opener.
- Opening the Manage conversations dialog moves focus to its "Manage conversations" title; Escape
  restores focus to the opener.
- The destructive delete-confirm dialog still focuses Cancel (the safe default), not its title.

### Composer focus after navigation

- Creating a new conversation (the New conversation button or Alt plus N) and quick-switching
  between conversations land keyboard focus in the composer ("Message").
- A plain page reload does NOT move focus into the composer (focus is only taken on an intentional
  in-app navigation).

## Per-conversation model surface checklist

Run this after the rich model picker checklist. It covers the per-conversation model, the redesigned
conversation header, and the advanced new-conversation dialog. Cover at least NVDA plus Firefox.

### Conversation header

- The conversation's level-1 heading reads its real title (for a brand-new draft with no title yet
  it reads "New conversation"); after the first turn or an inline rename the heading updates to the
  saved title.
- A "Conversation settings" region is reachable by landmark; inside it a "Model" picker (the same
  searchable combobox as Settings) and an "Advanced settings" disclosure are announced.
- The "Advanced settings" accordion is collapsed by default; expanding it (Enter or Space on its
  trigger) reveals the "Thinking effort" control, and collapsing it hides the control again.

### Per-conversation model

- The header "Model" picker offers a "Use default model" option as the first item; choosing it sets
  the conversation to inherit the Settings default, and the trigger then reads "Model Use default
  model".
- Choosing a concrete model announces "Model set to" that model's label (the model and connection
  names only - never the conversation title or any message text) and the trigger reads the chosen
  model.
- The chosen model persists across a page reload (the trigger still reads it after reload).
- A conversation pinned to a model whose connection is no longer configured surfaces the existing
  recoverable "model unavailable" notice rather than a hard error, and the composer stays disabled
  until a usable model is chosen.

### Advanced new-conversation dialog

- The "New conversation with options" button and the Alt plus Shift plus N shortcut both open a dialog whose
  focus lands on its "New conversation" title (read first), not on a footer button. Note the Windows
  caveat: Alt plus Shift can also trigger the OS keyboard-layout switch on some layouts; verify the
  shortcut still opens the dialog, and fall back to the button if the layout switch intercepts it.
- The dialog has a "Title (optional)" text box and a "Model" picker (with "Use default model"); both
  are labelled and reachable.
- Activating Create closes the dialog, moves to the new conversation, and lands keyboard focus in the
  composer ("Message"); the conversation carries the chosen title and model.
- Escape or Cancel closes the dialog and restores focus to the opener (the "New conversation with
  options" button).

## Recording results

When testing a surface, append a dated result block below so the history is in one place.

Format:

- Surface: Foundation shell
- Date: YYYY-MM-DD
- Tester: (name or handle)
- SR + browser: e.g., NVDA 2024.4 + Firefox 138 on Windows 11
- Result: PASS / FAIL / PARTIAL
- Notes: any failures or deviations

- Surface: Accessible single-conversation chat (foundation through connections)
- Date: 2026-06-17
- Tester: Akash (akash07k)
- OS: Windows 11 25H2 (build 26200.8655)
- SR + browser: NVDA 2026.1 + Firefox 151.0.4; also NVDA 2026.1 + Chrome 149.0.7827.104
- Result: PASS
- Notes: All single-conversation surfaces read and operate correctly (heartbeat, quick-nav, focus, jumps,
  announcements, the reasoning controls, settings, and connections). Local-provider reasoning
  verified against a running OpenAI-compatible server, including "Send extended thinking
  parameters" off answering cleanly. One issue was found during the pass and fixed: each
  connection's Active checkbox announced a bare "Active"; it now composes the connection name (for
  example "Active Venice"), and the fix was verified working with NVDA.
