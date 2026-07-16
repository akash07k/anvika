# Changelog

All notable changes to Anvika are documented here (Keep a Changelog format).

## [Unreleased]

### Added

- Project foundation: Bun workspace with packages/shared, apps/server, and apps/web;
  oxlint/oxfmt, markdownlint, Lefthook with commitlint; Vitest unit tests; LogTape logging
  with daily rotation; `serve` CLI (commander, `--port`, `--data-dir`, `--no-open`) that opens
  the browser on startup; Hono server with `/api/v1/health` and `/api/v1/log` endpoints;
  accessible React 19 shell (Vite + Tailwind v4) with skip link, landmarks, and document
  heading; file-based TanStack Router (chat and settings routes); typed API client;
  Playwright + axe E2E smoke test; manual screen-reader test plan.
