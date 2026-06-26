# Write-only secrets and the redacted settings projection

Status: Accepted

> Note: the sections below describe the original v1 provider-map design. Several specifics
> (the provider-map redaction walk, the Azure deployment field, and the PATCH-clears-secret
> mechanics) were superseded by the provider-connections milestone; see the "Update
> (provider-connections milestone)" section at the end and ADR 0024 for the as-built behavior.

Provider API keys live in the settings object, but they must never leave the server in
plaintext. The settings system therefore treats secrets as **write-only**: a secret can be
written through `PATCH /api/v1/settings`, but `GET` never returns it - it returns a
metadata-derived **redacted projection** in which each secret field is replaced by an
`{ isSet: boolean }` indicator. The server is the sole holder of plaintext.

Which fields are secret is declared once, on the schema: each secret field is marked
`.meta({ secret: true })` (every provider `apiKey`; Azure's `resourceName` and
`deployment` are non-secret config returned in plaintext). A structure-aware,
metadata-driven `redactSecrets` walks the provider map and, for each field whose schema
metadata sets `secret: true` (read via `z.globalRegistry.get(schema)?.secret`), substitutes
`{ isSet: value.length > 0 }`. `PATCH` accepts a new secret value, deep-merges it into the
current settings (omitted secrets are preserved; a secret is overwritten only when explicitly
present, and `null`/`''` clears it), re-validates the merged whole, and persists. On the
client the typed-in value lives only in the `SecretField`'s local component state - it is sent
in the PATCH body and then cleared, never lifted into the Zustand store, devtools, or logs.

Rationale: the client is the user's own local browser, but a key returned by `GET` would sit
in the network tab, the response cache, the client memory, and any state snapshot - exactly
the exposure the never-log-keys floor (ADR 0008, spec 4.5) exists to prevent. Declaring
secrecy as schema metadata (not a hand-maintained field list) keeps one source of truth: the
redactor and the form both read the same flag, so adding a future secret field is a single
`.meta({ secret: true })` annotation.

## Considered Options

- **Write-only secrets with a metadata-driven redacted GET projection (chosen):** secrets
  never cross the HTTP boundary; the redaction is derived from the same schema that validates,
  so there is no parallel view-schema to drift. Cost: keys cannot be pre-filled or read back
  (the normal credential-UI cost - the form shows "Set" + a Replace affordance instead of the
  value), and the redacted-output TYPE must be kept in step with the secret metadata when a new
  secret field is added.
- **Plaintext GET (return the stored key so the form can pre-fill it):** rejected. It puts the
  key in the network response, the browser cache, client memory, and devtools - defeating the
  never-expose-keys requirement for a marginal UX gain.
- **A hand-maintained list of secret field names in the redactor:** rejected. A second source
  of truth that silently drifts from the schema; a new secret field would leak until someone
  remembered to add it to the list. The metadata flag makes the schema authoritative.
- **Encrypt keys at rest and return the ciphertext:** rejected for the initial release. It adds a key-
  management surface without removing the exposure (the client still cannot safely hold the
  plaintext), and the threat model is a single local owner, not a shared datastore.

## Consequences

- `GET`/`PATCH /api/v1/settings` return `{ version, settings }` where `settings` is the
  redacted projection; the plaintext settings object never serializes to a response.
  `redactSecrets` is applied at the route (the HTTP boundary); the service holds plaintext.
- The redacted-output type (`RedactedSettings`, where each `apiKey` becomes `IsSet`) mirrors
  the secret metadata and must be extended when a new secret field is introduced - the one
  coupling the metadata-driven approach does not erase, called out here so a future contributor
  keeps the type and the `.meta({ secret: true })` flags in step.
- Settings validation failures log only the error message / issue paths, never settings values
  (Zod `reportInput` is off by default), preserving the never-log-secrets floor.
- The decision is hard to reverse: it is the credential security model, so changing it later
  (e.g. to support reading a key back) would be a deliberate, reviewed change, not an incidental
  one. Parallel in spirit to ADR 0010 - a small, security-relevant settings-system invariant
  recorded so its "why" survives.

## Update (provider-connections milestone)

The write-only rule now extends beyond `apiKey` to the per-connection header VALUES on an
`openai-compatible` connection. The header NAMES are public configuration and are returned in
plaintext; the header VALUES are secrets and are redacted exactly like an `apiKey`. This is the
one place where a secret is a record of values rather than a single field, so the redaction is
structure-aware rather than a flat field substitution.

- The redacted GET view of a connection
  (`RedactedConnection` in `packages/shared/src/settings/redact.ts`) replaces `apiKey` with
  `{ isSet }` and replaces `headers` with `Record<headerName, { isSet }>` - each header name is
  kept (public config) and each header value becomes `{ isSet }` (the value never crosses the
  boundary). `redactSecrets` walks every connection and applies this projection, so neither a key
  nor a header value is ever serialized into a response.
- Both `apiKey` and the header VALUES are redacted by explicit, hardcoded handling in
  `redactConnection` - there is no meta-driven redaction walk for either. The `apiKey` field's
  `.meta({ secret: true })` flag drives the PERSISTENCE PARTITION (which fields are split out into
  `secrets.json`), not redaction; the header map cannot mark per-KEY secrecy on a Zod `record`, so
  it too is redacted explicitly. The two are handled the same way at the redaction boundary.
- The wire/endpoint split that actually WRITES these secrets (so neither `apiKey` nor header
  values ride the connections array on a settings PATCH) is the subject of ADR 0024 (the
  connection secret channel). This update only records that header values join `apiKey` under the
  same write-only, redacted-on-read rule.
