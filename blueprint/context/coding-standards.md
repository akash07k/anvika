# Coding Standards

## Workspace and architecture

- Use the Bun workspace boundaries: `packages/shared` holds the Zod-backed Contract,
  `apps/server` owns business logic and persistence, and `apps/web` owns presentation
  and accessibility.
- Keep clients thin. Put behavior that another client would need in the Server behind
  the versioned `/api/v1` HTTP Contract.
- Keep authored source files focused and below the 450-line hard cap. Split by
  responsibility rather than accumulating unrelated helpers.
- Apply KISS and SOLID. Every file and public interface should have one clear
  responsibility.

## TypeScript and naming

- Use strict TypeScript with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  and the other root compiler checks enabled.
- Do not use `any`, non-null assertions, or untracked TypeScript suppression comments.
  Prefer `unknown` plus narrowing at boundaries.
- Use named exports only and `import type` for type-only imports. Do not add barrel
  files.
- Use PascalCase React component files, kebab-case non-component files, camelCase
  functions and variables, PascalCase types and interfaces, and SCREAMING_SNAKE_CASE
  constants.
- Add concise TSDoc or JSDoc to every exported function, type, and interface.

## Server, Contract, and persistence

- Implement HTTP behavior in Hono routes and keep the canonical `{ code, message,
  details? }` error Contract from `packages/shared`.
- Validate every trust boundary in both directions with shared Zod schemas: HTTP
  request and response bodies, route/query values, persisted JSON, file input, and
  SDK passthroughs. Use strict schemas unless an explicitly documented transport
  compatibility exception requires otherwise.
- Keep AI SDK streaming behind its established orchestration seam. Do not duplicate
  AI SDK capabilities in route or client code.
- Use Drizzle over Bun SQLite for persistence. Keep storage concerns behind ports and
  inject those ports into routes and services.
- Treat conversations, settings, and secrets as local owner data. Never expose or log
  a secret.

## Web client and styling

- Use React 19 function components, Vite, TanStack Router, TanStack Query, Zustand,
  and focused custom hooks following the existing client patterns.
- Keep one exported component per file. Destructure component props at the signature.
- Use Tailwind CSS v4 and the established shadcn/ui components. Do not add inline
  styles.
- Keep route files in `apps/web/src/routes`, components in feature-oriented
  directories under `apps/web/src/components`, and client behavior in the matching
  hooks, stores, and library modules.

## Accessibility

- Meet WCAG 2.2 AA and treat screen-reader and keyboard behavior as acceptance
  criteria, not visual polish.
- Preserve visible focus, semantic controls, valid keyboard behavior, focus traps in
  dialogs, Escape dismissal, reduced-motion support, and text alternatives for every
  non-color state.
- Do not use a live region for streamed chat text. Send spoken status through the
  notification system so announcements remain concise and deterministic.
- Test UI behavior with accessible queries by role, label, or accessible name.

## Logging and errors

- Use LogTape, not `console`. Server events use `serverLogger`; client diagnostics use
  typed diagnostic events.
- Log a content-safe outcome at `info`, recoverable problems at `warning`, and failures
  at `error`.
- Do not log prompt or response text by default. Content logging requires the explicit
  development opt-in. Never log API keys or secrets.
- Surface typed, user-safe errors through the client UI while retaining useful,
  content-safe diagnostics for operators.

## Testing and verification

- Use `bun run verify` as the full gate: type checking, linting, formatting,
  Markdown linting, Vitest, Bun persistence tests, browser-mode tests, and Playwright
  end-to-end tests.
- Write Node/Vitest tests beside server, shared, and tooling code as
  `<name>.test.ts`. Use the `web` project for jsdom component and hook tests, and
  `.browser.test.tsx` for real-browser focus, keyboard, and accessibility behavior.
- Keep Bun SQLite adapter tests in `*.bun.test.ts` and run them through `bun run
  test:bun`.
- Use Playwright and axe for end-to-end flows. A manual screen-reader pass remains
  required for accessibility-affecting changes.
- Before a push or pull request, run the self-review checklist and `bun run verify`.

## Formatting, commits, and research

- Format TypeScript, TSX, JavaScript, and JSON with oxfmt. Lint with oxlint and lint
  Markdown with markdownlint.
- Preserve Lefthook checks and Conventional Commits. Keep commits atomic and do not
  add AI-attribution trailers.
- Before changing a library, framework, SDK, API, CLI, or cloud integration, consult
  current Context7 documentation. Record durable research findings under
  `docs/research/`.
- Use official scaffolding for new framework apps, libraries, and generated
  configuration. Do not hand-roll configuration that an official initializer owns.

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code cannot: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; do not write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
