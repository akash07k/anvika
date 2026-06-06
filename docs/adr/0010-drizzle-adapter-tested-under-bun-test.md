# The Drizzle adapter is tested under `bun test`, not Vitest

The persistence layer is tested with two runners. The Drizzle-over-Bun-SQLite adapter (and the
migration runner) are tested under **`bun test`** in `*.bun.test.ts` files; everything else -
ports, the save-policy and outcome-mapping modules, the routes, the app wiring, and the client -
is tested under **Vitest** against an in-memory fake `ConversationStore` injected through the
port. A `test:bun` script runs the Bun-runtime tests and is part of `bun run verify`; Vitest's
node project excludes `**/*.bun.test.ts`.

Rationale: `import { Database } from 'bun:sqlite'` fails under Vitest (`Cannot find package
'bun:sqlite'`) because Vitest runs its workers in Node even when launched via `bun run`, and
Vitest has no Bun worker pool. The Drizzle adapter imports `bun:sqlite`, so it cannot run under
Vitest at all. The dependency-inversion boundary (the `ConversationStore` port) means only the
thin adapter needs the Bun runtime; the rest of the server tests against a fake, so the split is
confined to one small file group. `bun:sqlite` / `drizzle-orm/bun-sqlite` imports stay inside
`persistence/drizzle/*` and `server.ts` (the composition root), keeping them out of the Vitest
module graph entirely.

## Considered Options

- **Split runners - adapter under `bun test`, everything else under Vitest with a fake store
  (chosen):** tests the real production driver against real SQLite, with the Bun requirement
  isolated to the adapter by the port boundary. Cost: two runners and two commands in `verify`,
  plus a `*.bun.test.ts` naming convention contributors must learn.
- **One runner, test the adapter with a different Node-compatible SQLite driver (better-sqlite3
  / libsql):** rejected. It would test a different driver than production - divergence risk, an
  extra dependency, and it defeats the purpose of testing the real adapter.
- **One runner, do not unit-test the adapter (cover it only via the credential-gated E2E and
  manual smoke):** rejected. The one module with real SQL, the atomic upsert, and JSON handling
  would have no fast deterministic test; regressions would surface late.
- **Move all server tests to `bun test`:** rejected. It rewrites the 100+ existing Vitest
  tests (mock helpers, `vi.mock`), and the web suite still needs Vitest + jsdom - so the project
  ends up with two runners anyway, after a large rewrite. Net worse.

## Consequences

- A `test:bun` script (`bun test apps/server/src/persistence`) runs the Bun-runtime tests; it is
  folded into `bun run verify`, and the Vitest node project sets `exclude: ['**/*.bun.test.ts']`.
- The adapter round-trip, the migration runner, and a composition-seam integration test (the
  real adapter behind the real routes, including migrations, exercised with a mock model) live in
  `*.bun.test.ts` files under `apps/server/src/persistence`.
- Contributors must name Bun-runtime tests `*.bun.test.ts` and keep `bun:sqlite` imports out of
  any module that Vitest loads.
- A future move to a non-Bun SQLite driver, or a Vitest Bun pool, would let the split collapse
  back to a single runner; until then, the two-runner setup is the cost of testing the real
  driver.
