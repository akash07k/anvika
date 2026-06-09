# Bun workspace monorepo

Anvika is structured as a Bun workspace with three packages - `packages/shared` (Zod schemas and shared types), `apps/server` (the Hono server), and `apps/web` (the Vite/React client) - rather than a single application.

We chose this because the project is API-first: the server is the product's heart, and the web client is only the first of potentially several clients (a mobile client may follow). The request/response contract therefore must live in a shared package that any client can depend on without reaching into the web app. The cost is minor monorepo ceremony; the benefit is that the client-agnostic boundary the whole architecture rests on is enforced by package structure from day one.

## Considered Options

- **Single-app layout with the same three boundaries kept as top-level folders.** Lighter for an initial release that has exactly one client. Rejected because it would couple the contract to the web client and quietly undercut the API-first principle the project is built on. The boundaries matter more than the packaging, but making the contract a real package is cheap insurance that keeps it client-agnostic before any code accretes against the wrong shape.
