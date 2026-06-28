# Releasing Anvika

Anvika is a young project. It has not cut a numbered release yet, so this guide describes the
real posture today rather than a release pipeline that does not exist. It covers how versions
and the changelog are tracked, how to build the shipping artifact, which platforms that artifact
targets, and how the project is meant to be distributed.

## Versioning and the changelog

All notable changes are recorded in `CHANGELOG.md`, which follows the
[Keep a Changelog](https://keepachangelog.com) format and is maintained by hand. Every change
that is worth a reader's attention is written into the `Unreleased` section under the usual
headings (`Added`, `Changed`, `Fixed`, and so on) as part of the work that makes the change.

Commit messages follow Conventional Commits, enforced by commitlint through a Lefthook hook. The
commit history is the running record of what happened and feeds the human-written changelog
narrative, but the changelog is not generated from commits. A person decides what belongs in the
changelog and writes it in prose, so it stays readable rather than being a raw commit dump.

There is no published version number yet. The changelog holds a single `Unreleased` section; the
first tagged version will move those entries under a dated heading.

## Building release artifacts

The shipping artifact is a single standalone binary that bundles the web client and the server
into one executable. Build it with:

```sh
bun run compile
```

The output is `dist/anvika` (`dist/anvika.exe` on Windows), and `bun run build` is an alias for
the same command. The full pipeline - the web build, the embed codegen step, the compile flags,
the build variants, and the embedded migrations - is documented in
[the build guide](build.md). After building, `bun run smoke` exercises the freshly built binary
end to end (health endpoint, served UI, settings endpoint, and the default-command path).

## Platform support

Today the binary targets Windows. The compile commands produce a Windows executable, and that is
the only platform the build is exercised on.

Cross-compiling to macOS and Linux is future work and is not yet implemented. `bun build --compile`
accepts a `--target` flag, so adding the other platforms is a matter of running the compile across
a target matrix and wiring up a continuous-integration release workflow to package the results. No
application code change is required for this; it is purely build and release plumbing that has not
been built yet.

## Distribution posture

Anvika is source-first for now: the supported way to run it is to clone the repository, install
with `bun install`, and build or serve from source. The standalone binary is the portable
distribution - one self-contained file that runs on a machine with no source tree - and it is the
intended hand-off for users who do not want to work from a checkout.

Of the build variants, distribute the default console-visible binary, not the windowless one. The
windowless variant suits double-click launching but writes nothing to a terminal, so an early
startup failure surfaces only in a log file the user would have to know to open - the wrong
hand-off for a screen-reader audience. The build guide's variant section has the full rationale:
[docs/build.md](build.md).
