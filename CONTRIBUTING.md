# Contributing to Anvika

## Welcome

Thank you for your interest in Anvika. Contributions are welcome, and we are glad you
are here. Anvika is an accessibility-first AI application built for screen-reader and
keyboard users, so accessibility is not an afterthought here. It is the reason the
project exists, and we ask every contribution to hold that bar. The rest of this guide
explains how to set up your environment, the quality gate every change must pass, the
conventions we follow, and how we handle commits, accessibility, and pull requests.

## Getting set up

You need Bun. Anvika is a Bun workspace, and Bun is the only runtime and package manager
you need.

1. Clone the repository.
2. Install dependencies with `bun install`.
3. Start the development servers with `bun run dev`. This runs the server and the web
   client together in watch mode. To run the already-built app instead of the watch-mode
   loop, use `bun run serve` (the path the README quickstart takes).

For the full development loop, environment variables, logging flags, and where things
live, read `docs/development.md`.

## The bar: `bun run verify`

Every change must pass `bun run verify` before it goes into a pull request. This is the
full quality gate, and it runs the following steps in order:

- `bun run typecheck` - TypeScript type checking across the workspace.
- `bun run lint` - the oxlint linter.
- `bun run format:check` - the oxfmt formatter check.
- `bun run md:lint` - markdownlint over the Markdown files.
- `bun run test` - the Vitest `node` and `web` projects.
- `bun run test:bun` - the Bun-native persistence tests.
- `bun run test:browser` - the Vitest `web-browser` project.
- `bun run e2e` - the Playwright end-to-end tests.

Run `bun run verify` locally and get it green before you push. If you only want to run
one piece while iterating, each step above is its own script.

## Conventions

The conventions are written once and kept in two places that we treat as the source of
truth: `AGENTS.md` and `docs/agents/conventions.md`. Read them before you write code.
The highlights are:

- Keep files small and focused, with one clear responsibility each.
- Write TSDoc on every exported function, type, and interface.
- No `any`, no non-null assertions, and no `console` - use the logger instead.
- Use named exports; we do not use barrel files.
- Validate every value that crosses a trust boundary with Zod, in both directions, on
  the way in and on the way out.

We summarize here on purpose. The two source-of-truth files carry the full, current
list, so follow them rather than this summary when the two differ.

## Commits

We use Conventional Commits, for example `feat: add the model picker` or
`fix: handle an empty conversation title`. This is enforced automatically: the Lefthook
`commit-msg` hook runs commitlint against your message, so a commit that does not follow
the convention is rejected before it lands. The Lefthook pre-commit hooks also run
formatting, linting, type checking, and tests on your staged changes.

## Accessibility expectations

Accessibility is a first-class requirement, not a finishing touch. Anvika targets
screen-reader and keyboard users first, so:

- Every interactive element must be reachable and operable by keyboard alone, with a
  clear focus order and accessible names.
- Our tests run axe against the UI, and axe must report zero violations.
- Before a release of work, we also run a manual screen-reader pass against the support
  matrix.

The full accessibility contract, the screen-reader support matrix, and the manual test
plan live in `docs/accessibility/`. Read them when you touch the user interface.

## Pull requests

When your change is ready:

1. Branch off `main`.
2. Keep the pull request focused on one change. Small, single-purpose pull requests are
   easier to review and faster to land.
3. Run the pre-pull-request self-check on your own diff before you open the pull
   request. The checklist is in `docs/agents/self-review.md`, and `bun run verify` must
   be green.

Open the pull request against `main`, describe what changed and why, and call out any
accessibility implications. We will review from there.
