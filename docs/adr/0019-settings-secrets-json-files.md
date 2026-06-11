# User settings live in settings.json and API keys in a separate secrets.json; the DB holds only conversations

User application settings and provider API keys move OUT of the SQLite database and into two
JSON files in the resolved data directory, beside `anvika.db`: a human-readable `settings.json`
for non-secret settings and a separate `secrets.json` for secret values (today every provider
`apiKey`). The database keeps only conversations (and future app data); its `settings` table is
dropped. A `FileSettingsStore` implements the existing `SettingsStore` port
(`apps/server/src/persistence/ports.ts`) so the settings service is unchanged - the
secret-vs-public split is internal to the adapter.

This revisits ADR 0003 ("server owns persistence"): the server still owns persistence and is
still the sole holder of plaintext secrets (ADR 0011), now with a file-backed settings store
plus the DB for conversations, and secrets separated into their own file.

## Rationale

- **Human-readable and hand-editable.** Settings are configuration, not app data; a pretty-printed
  JSON file is something the owner can read, back up, diff, and hand-edit, which a SQLite row is
  not. Hand-editing is an intended workflow, so the read path is forgiving (below).
- **Portable and transparent.** Plain files in the user-visible data directory match Anvika's
  transparent, no-hidden-OS-dir data-dir philosophy and travel with the app.
- **Secrets gitignored and permissioned separately.** A dedicated `secrets.json` can be excluded
  from version control and have its own file permissions independently of the non-secret settings.
- **Enables a future "reset excluding keys".** Because the two trees live in two files, a future
  "reset settings but keep API keys" is trivial: rewrite `settings.json`, leave `secrets.json`
  alone.

## How it works

- **Schema-driven secret split.** Two pure, shared helpers in
  `packages/shared/src/settings/partition.ts` own the secret-vs-public knowledge, modeled on the
  existing `redactSecrets` walk so the Zod `secret` meta flag stays the single source of truth.
  `partitionSecrets(settings)` walks the validated settings and extracts every leaf whose schema
  marks `secret: true` into a `secrets` tree shaped like its nested location, returning the
  remainder as `public`; `mergeSecrets(public, secrets)` deep-merges the two trees back into one
  `data` object. A future secret field is covered automatically by tagging it `.meta({ secret:
  true })` - no field list to maintain (same invariant as ADR 0011).
- **Atomic writes with a Windows retry and an in-process mutex.** Each file is written to a sibling
  temp file then `rename`d over the target (atomic on the same filesystem), so a reader never sees
  a half-written file. Windows can throw transient `EPERM`/`EBUSY` under antivirus or Search
  Indexer locks, so the write helper retries a few times with a tiny backoff on those codes. No
  external dependency (`write-file-atomic` considered and declined for a single-user local app).
  `FileSettingsStore` serializes `save` through an in-process async mutex (a promise chain) so two
  PATCHes cannot interleave the two-file write; the two files are written as a unit inside the
  mutex.
- **Corrupt-file handling that never destroys a hand-edit.** A present-but-unparseable or
  unreadable `settings.json` makes `load` throw a typed `SettingsReadError` (content-safe message,
  no values). The service catches it, logs content-safe, and falls back to defaults with a
  `recovered: true` flag (distinct from a legitimate first-run `null`, which is `recovered: false`;
  a present-but-schema-invalid file parses as JSON and reaches the existing service `safeParse`
  soft-fail, which also sets `recovered`). The store never auto-overwrites a corrupt file on read -
  only an explicit `save` rewrites it - so a transient read failure cannot silently erase a
  hand-edited file. The `recovered` flag is forwarded on the GET response and the client announces
  "Settings file could not be read; using defaults", making a fat-fingered edit audible to a screen
  reader user instead of silently reverting.
- **Server-enforced overwrite confirmation.** When the current on-disk file is unreadable (the load
  was `recovered`), a PATCH that would overwrite it is refused by the server with a
  `code: 'settings-file-invalid'` API error and HTTP 409 UNLESS the request carries
  `overwriteInvalid: true`. The server is the gatekeeper (API-first), so no client can silently
  clobber an invalid file. The web client surfaces the 409 as an accessible modal confirmation
  built on the native HTML `<dialog>` element (`showModal()` gives a focus-trapped,
  Escape-dismissable, screen-reader-friendly modal): it explains the file is invalid and the app is
  on defaults, shows the resolved file path, and offers "Overwrite and save" (retries with
  `overwriteInvalid: true`, discarding the manual edits) or "Cancel" (leaves the file untouched so
  the user can fix it by hand).
- **Reload, not watch.** A "Reload settings" button in the Settings UI invalidates the settings
  query so the client refetches and the server re-reads the files (there is no server cache, so a
  GET always re-reads). There is deliberately no live file-watcher: a watcher would need a
  server-to-client push channel Anvika does not have, whereas a reload button is nearly free and
  fully keyboard- and screen-reader-accessible.
- **Clean cutover.** `settingsTable` is removed from the Drizzle schema and a drizzle-kit migration
  (`0002`) drops the table; `runMigrations` applies it at boot. There is no import code: settings
  start at defaults after this lands and the owner re-enters API keys once. `DrizzleSettingsStore`
  and its tests are removed; the `SettingsStore` port and the `withSettingsStoreLogging` decorator
  are unchanged and reused, so content-safe load/save logging coverage is unchanged.

## Security posture

- `secrets.json` is plaintext JSON. Real encryption is deferred to its own future decision (key
  management is the expensive part, and anything cheaper is security theater); the optional
  plaintext toggle ships with that feature.
- Best-effort `0600` permissions on `secrets.json` writes (POSIX `chmod`; on Windows `fs.chmod` is
  effectively a no-op, so it is best-effort there - noted, not relied upon).
- Secret values are never logged: the redaction layer (ADR 0011) and the content-safe store logging
  both already enforce this, and the new partition helpers carry no logging of values.
- The threat model is a single local owner on their own machine, not a shared datastore, consistent
  with ADR 0011's reasoning.

## Considered Options

- **Settings stay in SQLite (status quo):** rejected. A SQLite row is not human-readable or
  hand-editable, cannot be gitignored or permissioned separately from conversations, and mixes user
  configuration and credentials into the app-data store. Keeping configuration as files is the
  transparent, portable, back-up-friendly choice and the reason for the move.
- **One combined file vs two files:** chose two. A single file holding both settings and keys cannot
  be gitignored or permissioned independently, and a "reset settings but keep keys" would have to
  surgically rewrite part of one file rather than simply leaving the other untouched. Two files keep
  the secret and non-secret concerns physically separable, which is the whole point of the split.
- **A Radix/shadcn dialog for the overwrite confirmation:** deferred. shadcn/Radix is not yet
  vendored in `apps/web` (the UI is hand-built accessible components), so introducing it here is out
  of scope; the native `<dialog>` plus `showModal()` already gives a focus-trapped,
  Escape-dismissable, screen-reader-friendly modal with zero new dependencies. A shadcn dialog can
  replace it when shadcn is vendored.
- **Live file-watcher / hot-reload:** rejected for the reload button (above).
- **Encrypt keys at rest now:** deferred (above).

## Consequences

- The data directory now holds `anvika.db` (conversations only), `settings.json`, and
  `secrets.json`. The default data dir is `userdata/`, which is **already gitignored**. An operator
  who points `--data-dir` (or `ANVIKA_DATA_DIR`) at a custom location is responsible for excluding
  that directory from version control themselves - the repo `.gitignore` only covers the default
  `userdata/`. `secrets.json` holds **plaintext API keys**, so this matters: never commit a custom
  data dir. (This note lives here, in the ADR consequences, because Anvika has no operator README;
  this ADR is the live home for the data-dir security note.)
- The resolved absolute paths of `settings.json` and `secrets.json` are exposed to the client
  (paths only, never values) and shown read-only in the Settings UI near the Reload button and in
  the overwrite dialog, so the hand-editing workflow is discoverable.
- **Single-process only.** The write mutex is in-process; two server instances pointed at one data
  directory could clobber each other's settings (last-write-wins, no cross-process lock). This is
  accepted and consistent with the single-user, single-process model. Cross-file consistency on a
  hard crash between the two renames is best-effort and self-corrects on the next save (the trees
  are disjoint, so the merged result still validates).
- Adding a future secret field stays a single `.meta({ secret: true })` annotation; `partitionSecrets`
  routes it to `secrets.json` automatically, the same invariant ADR 0011 records for redaction.
- The single schema `version` lives in `settings.json` and governs both files; migrate-on-read is
  unchanged (the service migrates the merged `data` from `version` up to current).
