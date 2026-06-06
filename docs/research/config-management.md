# Configuration / Settings Management - Recommendation

> For the accessible AI application: Vite + React SPA client, Hono server on Bun, persistence via Drizzle ORM over Bun SQLite, single user (owner = "local"). Many behaviours are user-configurable (announcement heartbeat period, progressive-sentence announcements on/off, read-full-response-on-complete on/off, focus-on-completion behaviour, send-key mode, and a fully rebindable hotkey keymap).

## Recommended stack

- Server: a Zod v4 schema-driven configuration module. The schema is the single source of truth for validation, defaults, TypeScript types, and (via `z.toJSONSchema()`) settings-UI rendering hints.
- Persistence: Drizzle ORM over Bun SQLite. Store settings as a JSON column (`text('data', { mode: 'json' })`) on a single-owner row, with a `version` integer column for migrations.
- API: `GET /api/settings` returns the full validated settings object; `PATCH /api/settings` accepts a partial update, the server merges and re-validates the whole object before persisting.
- Client: a Zustand store holds settings, hydrated from `GET /api/settings` on load, with per-field updates that subscribers can read granularly. Optimistic update then `PATCH`.
- Versioning: a simple migration registry (version number to migration function), applied on read, then re-validated by the Zod schema.

## Why not the dedicated config libraries

- convict: schema-based but heavier, oriented to file + env-var config; overkill when settings live in a database; has had security advisories.
- conf: designed for Electron/Node file storage in platform-specific directories; a misfit for server-persisted settings.
- nconf: hierarchical merging of env, files, and CLI args (12-factor app config), not user settings; no schema validation.
- electron-store: aimed at Electron, effectively unmaintained; not for server persistence.

Bottom line: these conflate environment/app config with user data. Our settings are user data stored server-side, so a Zod + Drizzle module is a better, lighter fit than any of them.

## Server schema (Zod v4)

The schema defines each setting with a default and optional `.meta()` for UI rendering. Zod v4 adds `z.toJSONSchema()`, so the client can render a settings form from the schema plus metadata. Example shape:

- `announcementHeartbeatMs`: positive integer, default 2000, meta title/description, min/max hints.
- `progressiveSentences`: boolean, default false (deferred feature), meta title.
- `readFullResponseOnComplete`: boolean, default to be decided (see brainstorming Question B).
- `focusOnCompletion`: enum of keep-in-composer or move-to-response, default keep-in-composer.
- `sendKeyMode`: enum Enter or CtrlEnter, default Enter.
- `hotkeyMap`: record of action name to key binding, default the built-in keymap, meta uiType keymap-editor.

`.default()` supplies fallbacks; `.meta()` carries title, description, category, uiType, and hints for the settings UI; the schema infers the TypeScript `Settings` type with no codegen.

## Versioning and migration

Store a `version` integer alongside the JSON data. Keep a registry mapping each version to a migration function that transforms the previous shape forward (add field, remove field, rename). On read, run forward migrations from the stored version to the latest, then parse with the current Zod schema to re-validate. Migrations are plain TypeScript functions, zero dependencies, and unit-testable.

## Client reactive state - Zustand (not Jotai, not Context)

- Zustand: hook-based, minimal boilerplate, subscribers re-render only on the fields they read, idiomatic for a cohesive settings object in a Vite + React SPA. Actively maintained. Recommended.
- Jotai: atomic state shines for many small independent pieces (canvas editors, filter combinatorics); settings are a cohesive object, so Jotai adds unnecessary atom-dependency overhead.
- React Context: re-renders all consumers on any change; settings can change mid-session (e.g. rebinding a hotkey), which would cause broad re-renders. Use only for low-frequency global state.

## API design

- `GET /api/settings`: load row, run migrations if needed, Zod-parse, return the full typed object.
- `PATCH /api/settings`: validate the partial body against a partial of the schema, merge into the current object, re-validate the full object, persist. Client says what changed; server guarantees consistency.

## Implementation checklist

Server: define the Zod settings schema with defaults and `.meta()`; create the Drizzle table with `version` and a JSON data column; write and test the migration registry; implement `GET` (parse + migrate) and `PATCH` (partial validate, merge, re-validate, persist).

Client: create the Zustand settings store; fetch and hydrate on init; expose per-field and partial setters; optimistic update then `PATCH`; render the settings form from the schema's JSON Schema plus metadata.

Testing: unit-test Zod parsing and each migration function; integration-test persist, fetch, and migrate; end-to-end test updating an individual setting and verifying whole-object consistency.

## Key sources

Zod v4 docs and `z.toJSONSchema()`; Zustand vs Jotai vs Context comparisons (2026); Drizzle ORM Bun SQLite and SQLite column types; security/maintenance notes for convict, conf, nconf, electron-store.

## Implementation findings (2026-06-06)

- Zod v4 metadata drives redaction: `.meta({ secret: true })` registers custom keys to
  `z.globalRegistry`; `z.globalRegistry.get(schema)?.secret` reads them back. The redactor reads the
  flag off the leaf field-schema instances exported from `settings/providers.ts` (no ZodDefault/
  ZodOptional unwrapping).
- `z.record(z.enum([...]), v)` is EXHAUSTIVE in v4 (all keys required); `.default(map)` supplies a
  complete map. Use `z.partialRecord` only for genuinely optional keyed maps.
- The PATCH boundary uses `z.looseObject({})`, NOT `z.object({})` - the latter strips unknown keys, so
  the deep-merge would receive an empty patch. The real validation is the post-merge re-validate of
  the whole settings object.
- Clear semantics: within a provider, `null` or `''` clears a field (provider fields are
  `.min(1)`); `providers.<id>: null` clears the whole entry; top-level `localBaseUrl`/`selectedModelId`
  legitimately accept `''`.
- Write-only secrets: plaintext lives only in the `SecretField`'s local state; the Zustand
  store holds `{ isSet }` and never the value.
- Zod v4 `.default()` vs `.prefault()` on a NESTED schema: `.default(value)` short-circuits when the
  input is `undefined` - it returns `value` as the OUTPUT WITHOUT running the inner schema, so nested
  per-field defaults do NOT fire. For a wrapper whose own default is `{}` but whose children have their
  own defaults (e.g. `ProvidersSchema`, where `parse(undefined)` must yield `{anthropic:{}, ...}`), use
  `.prefault({})` - it supplies `{}` as the parse INPUT so the inner object schema runs and fills the
  nested defaults. `SettingsSchema.parse({})` (an empty OBJECT, not `undefined`) is unaffected because
  the object parse fires each field's default normally. Verified against `zod@4.4.3` + Context7
  `/websites/zod_dev_v4`.
- Zod issue type for forwarding validation errors as opaque `details`: `import type { $ZodIssue } from
  'zod/v4/core'` resolves under `zod@4.4.3` (fallbacks: `z.core.$ZodIssue`, or `unknown[]`).
- Commit-on-blur field model: text/number fields hold a local draft and commit via `onCommit`
  on blur (number field keeps the draft as a STRING and parses on blur, so partial input never trips
  schema `min`/`max`); toggles/selects commit on change. Each commit is one optimistic update + one
  PATCH + one polite "Settings saved" notice - never per keystroke.
