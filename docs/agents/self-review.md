# Pre-pull-request self-check

A focused second pass that catches a defect before a reviewer does. Run it on your own
diff before you push or open a pull request. Most review comments share one cause: code
written to produce the intended output on the one example in mind, and stopped there.
Each is a case the author could have caught by interrogating their own change.

## The core rule

Write the review comment before the reviewer does. Before pushing, read your diff -
and the code and prose immediately around it - and ask "what breaks this, and what did
this just make wrong?" Then fix it or note it. Most comments come from a ten-minute
careful read of the change in its context.

## The review dimensions

Apply each check to the change. Each lists what to ask and the real defect it would
have caught.

### Boundary check

Where does external or untrusted data enter or leave - an HTTP request or response
body, a query string, a route param, a JSON column read back from SQLite, a file, a
client-to-server payload? Is it validated with Zod in both directions, not just on
input? Does any user-controlled text reach the logs or persistence (privacy: never
log prompt or response text, or API keys)?

- Caught: a client-log endpoint that persisted arbitrary client text; successful API
  responses cast with `as` instead of validated; a free-form `data` field smuggling
  user text past the privacy rule.

### Hostile-input check

For every function, list the nasty inputs and confirm each is handled or provably
impossible: empty, null or undefined, malformed, boundary (0, max, off-by-one), very
large, `bigint`, circular reference, `NaN`, non-TTY, a missing file, a locked file, a
permission-denied error. Write a test for the ones that matter.

- Caught: log rendering that threw on `bigint` and circular references; a retention
  sweep that aborted entirely when one file failed to delete; a port parser that bound
  the wrong port on a malformed string.

### Seam check

Does correctness depend on two files agreeing? An inverse pair (encode and decode,
stamp and parse) gets a round-trip test. A shared assumption (units, timezone,
encoding) gets asserted. A dependency direction gets the cycle check.

- Caught: a UTC stamp written in one file but parsed as local in another; a `cli`
  to `main` import cycle.

### State-space check

In how many distinct states, routes, or modes does this code run? Is the value,
label, or behaviour correct in all of them, or hardcoded for one?

- Caught: a `<main aria-label="Chat">` that was wrong on the settings route.

### Verify-the-artifact check

After a change, confirm the artifact actually changed as intended: the diff is
non-empty, the exact line is present, the test goes red then green, the commit is not
empty. Never trust "I edited it."

- Caught: a documentation typo "fixed" by an empty commit that changed nothing.

### Verify-the-claim check

Never accept a library API, a reviewer assertion, or a memory as fact. Check the
installed types, Context7, or a runtime probe.

- Caught: a reviewer claim that a logger method did not exist (it did - confirmed by
  probe); and, on the flip side, confirming that oxlint's type-aware rules need an
  extra package before wiring them into the gate.

### Consistency check

After changing one occurrence, grep for every sibling and unify them. Inconsistency
invites a flag even when it is harmless.

- Caught: a mix of `.warn` and `.warning` logger calls.

### Stale-neighbor check

A diff shows what you touched, not what you just made wrong. Re-read the whole
enclosing scope - the entire function, the entire paragraph, the doc section - not only
the hunk, and ask: does any unchanged comment, sentence, or claim beside the change now
contradict it? When the same rule lives in several files, amend them the same way (all
rewrite, or all append) and confirm each edited unit reads consistently end to end; a
half-amended paragraph contradicts itself. This is the sibling of the consistency check:
that one unifies repeated occurrences, this one repairs neighbours a change invalidates.

Green tests do not catch a stale comment or docstring - this is a read-the-diff pass,
not a test. Run it on every edit, including one-line changes; passing tests is not a
substitute for it. The cluster where it slips is fast inline edits committed on green:
keep the read-the-diff pass before every commit, and use the spec-then-quality review for
anything beyond a trivial edit.

- Caught: an inline `// ... never the response text` comment left intact directly above
  a new line that logs the response text; a privacy rule rewritten in two docs but only
  appended-to in a third, leaving its absolute first sentence contradicting the opt-in
  qualifier in the same paragraph; and a component TSDoc still saying "each provider gets
  its own `h2` heading" after the code and its test were changed to `h3` nested under an
  `h2` section - reached the pull request because the edit was committed on green without
  the read-the-diff pass.

## Automated backstops

Some classes are removed from human judgement entirely, so they fail the gate before
they reach a person. Lean on them; do not re-check by hand what the gate enforces:

- `import/no-cycle` (oxlint) - dependency cycles. Proven to fire on a real cycle.
- `oxlint` categories `correctness` and `suspicious` at error.
- `no-console`, `typescript/no-explicit-any`, `no-non-null-assertion` - the style
  hard-rules.
- `bun run verify` - the full pre-PR gate in one command (typecheck, lint, format,
  markdown, unit tests, end-to-end). Run it before every push.

## Honest scope

The target is zero review comments caused by a defect you could have caught yourself -
not zero comments at any cost. Some comments are healthy: a genuine design
disagreement, or the reviewer being wrong. KISS and YAGNI still bind: robustness means
handling real inputs and proving the impossible ones impossible, not gold-plating
against inputs that cannot occur. These checks target the classes that actually bit
us, not infinite polish.
