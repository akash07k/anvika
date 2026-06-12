# Connection secrets travel on a dedicated secret endpoint, never on the connections wire

Status: Accepted. Supersedes the interim by-id preserve remediation that shipped earlier on this branch.

Connection secrets - an `apiKey` and the per-key `headers` values on an `openai-compatible`
connection - NEVER ride the `connections` array. That array, both the redacted GET view's non-secret
part and the `PATCH /api/v1/settings` body, is PURE public config. Secrets are written only through a
dedicated `PUT /api/v1/connections/:id/secret` whose body is a small set/clear/keep patch. The
settings PATCH path additionally STRIPS any incoming secret and overlays the stored secret by id, and
that strip - not Zod validation - is what makes a secret-on-the-wire structurally impossible. This is
the "Option C" decision.

## Context

The connections feature locked the merge contract that a `connections` PATCH replaces the WHOLE
array (to edit, add, or remove one connection the client resends every connection). That contract
collides with write-only secrets (ADR 0011): if the array carried secrets, editing one connection's
label would require resending every sibling's key, and a redacted GET (which never returns the key)
gives the client nothing real to resend - so siblings' keys would be wiped, or a "keep" convention
would have to be invented on the wire.

Two further forces shaped the choice. First, the connection discriminated union is intentionally NOT
`.strict()` (each variant legitimately declares `apiKey`/`headers` so the server-side plaintext type
is one shape), so Zod validation ALONE will not drop a declared `apiKey` sneaked onto a new
connection - validation accepts it. Second, the editing UX needs to TEST an edited connection with
its re-typed key applied over the stored secrets, without the client ever holding the untouched
stored key.

## Decision

### Public config and secrets are two separate channels

The public wire shape is `PublicConnection = Omit<Connection, 'apiKey' | 'headers'>`
(`packages/shared/src/settings/connection.ts`). The redacted GET view's connection is this public
shape plus `{ isSet }` indicators; the `PATCH /api/v1/settings` body's connections are this public
shape. No secret value is ever part of either.

Secrets are written ONLY via `PUT /api/v1/connections/:id/secret`
(`apps/server/src/routes/connections.ts`). The body is
`SetConnectionSecret = { apiKey?: string | null; headers?: Record<string, string | null> }`
(`packages/shared/src/connections/contracts.ts`): a string SETS a value, `null` CLEARS it, and an
absent field or absent header key LEAVES it unchanged. `applyConnectionSecret`
(`secret-apply.ts`) computes the next secret state from a stored connection plus a patch (pure, no
IO), and `setConnectionSecret` (`secret-service.ts`) applies it to the connection with that id,
validates the WHOLE settings object, and persists; on success the route returns the redacted
settings envelope, so no secret crosses the response boundary.

### The settings PATCH path strips secrets and overlays stored ones by id

On a `connections` PATCH, `attachStoredSecrets` (`apps/server/src/settings/attach-secrets.ts`)
processes every incoming connection: it FIRST strips `apiKey` and `headers` unconditionally (the
public projection), THEN overlays the STORED secret for that id (a non-empty stored `apiKey`, a
stored `headers` record) - but ONLY when the incoming connection's type matches the stored type.
Three cases follow: a brand-new connection (no stored match) ends up secret-free; an existing
connection of the SAME type carries its STORED secret, never a wire-supplied one; and an existing id
whose type was CHANGED ends up secret-free, because the stored secret of the old type is never
overlaid onto a different type - so a re-type cannot leak a secret across provider types.

The unconditional strip is the PURITY GUARANTEE. Because the union is not `.strict()`, a declared
`apiKey` on a new connection would survive Zod validation, so the schema alone cannot drop it - the
strip does. There is no `''` keep-signal and no omit-means-keep ambiguity; those mechanics are gone.

### Storage already mirrors the split

ADR 0019 already stores public settings in `settings.json` and secrets in `secrets.json` keyed by
id, and reaps a removed connection's orphaned secret. So the wire split and the storage split line
up: public config in one file, secrets by id in the other.

### The same shape doubles as a test override

`SetConnectionSecret` also serves as the test path's `override`: a test request is either a full
config (`{ connection }`) or a saved connection by id with an optional `override`
(`{ connectionId, override }`) in `TestConnectionRequestSchema`. `testConnection`
(`apps/server/src/connections/test-service.ts`) applies the override over the STORED secrets via the
same `applyConnectionSecret`, so an edited connection tests its re-typed key and changed headers
applied on top of what is stored - never a half-typed draft, and the client never holds the
untouched stored key.

### Client Save is two sequenced calls

The Save flow is a TWO-call sequence orchestrated in
`apps/web/src/components/connections/useConnectionMutations.ts` (`handleSubmit`), which
`apps/web/src/components/connections/ConnectionsFieldset.tsx` delegates to (the fieldset owns only
focus choreography). First the public connections PATCH (no secrets) via the shared dispatcher,
then - only when a secret actually changed and the public PATCH succeeded - the secret PUT via
`apps/web/src/hooks/connections/useSetConnectionSecret.ts`. A failed public PATCH skips the secret PUT entirely.
A PARTIAL failure (public saved, secret PUT rejected) announces the typed `connectionSaveFailed`
diagnostic event with the content-safe label, so the screen-reader user knows to re-enter the key
for that connection.

## Considered Options

- **(A) Server re-attach by id, with wire conventions for keep/clear:** rejected. Preserve stored
  secrets by id on a settings PATCH, using an empty-string header value as a "keep this header"
  signal and treating an omitted `apiKey` as "keep". This kept secret preservation on the settings
  route and a wire convention, and it created a draft-test imperfection: an edited draft tested an
  untouched header as ABSENT (the keep-signal was a storage convention the test path did not honor).
  This is the interim remediation that shipped earlier on this branch and that this ADR supersedes.
- **(A+) Option A's by-id preserve plus a test override only:** rejected as a softer single
  responsibility. Adding a test `override` fixed the draft-test imperfection but still routed secret
  PRESERVATION through the settings route and kept the keep convention; the settings route still owned
  two concerns.
- **(B) Element-level upsert PATCH (patch one connection, not the whole array):** rejected. It still
  needed a keep/clear convention for the secret fields and it changed the locked "connections
  replaces the whole array" merge contract, a larger blast radius than the problem warranted.
- **(C) A dedicated secret endpoint, with the settings route strip (chosen):** secrets never touch
  the connections wire; the settings route owns PUBLIC config and the secret endpoint owns SECRETS
  (clean single responsibility); there are zero wire conventions; and the unconditional strip makes
  the whole wipe/keep bug class structurally impossible rather than merely avoided by convention.

## Consequences

- The settings route can no longer write a secret even if a client tries: the strip drops it before
  validation, and only the stored secret (or none) is overlaid. The "edit a label, wipe a sibling's
  key" and "secret-on-the-wire" bug classes cannot occur by construction, not by discipline.
- A save that changes a secret is two requests; a partial failure is surfaced (not swallowed) via the
  `connectionSaveFailed` announcement so the user can recover. A save that changes only public fields
  is a single PATCH.
- Testing an edited connection is faithful: the override applies the re-typed key/headers over the
  stored secrets through the same `applyConnectionSecret`, so the test probes exactly what a save
  would persist.
- The decision is security-relevant and hard to reverse (it is half of the credential model, with ADR
  0011); changing it later would be a deliberate, reviewed change.
- Implementing files: `packages/shared/src/connections/contracts.ts`,
  `packages/shared/src/settings/connection.ts` (`PublicConnection`),
  `apps/server/src/connections/secret-apply.ts`, `apps/server/src/connections/secret-service.ts`,
  `apps/server/src/connections/test-service.ts`, `apps/server/src/settings/attach-secrets.ts`,
  `apps/server/src/routes/connections.ts`,
  `apps/web/src/components/connections/useConnectionMutations.ts`,
  `apps/web/src/components/connections/ConnectionsFieldset.tsx`,
  `apps/web/src/hooks/connections/useSetConnectionSecret.ts`.
