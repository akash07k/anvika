# Lefthook Staged-file Filtering

## Decision

Pre-commit type-checking and fast Vitest tests run only when a staged file matches:

```text
*.{ts,tsx,js,jsx,cjs,mjs,cts,mts,json,css,sql}
```

Markdown-only commits run the existing Markdown lint command but skip these expensive checks.
The full `bun run verify` gate remains mandatory before pushing.

## Rationale

Type-checking and the fast test projects provide no additional signal for documentation-only
changes. The filter retains coverage for source, TypeScript and JavaScript configuration, package
metadata, styles, and SQL migrations.

## Verified behavior

Lefthook filters the pre-commit staged files when a command has a `glob` but its `run` command
does not use `{staged_files}`. If no staged file remains after filtering, it skips that command.

## Source

- [Lefthook glob configuration](https://github.com/evilmartians/lefthook/blob/master/docs/configuration/glob.md)
