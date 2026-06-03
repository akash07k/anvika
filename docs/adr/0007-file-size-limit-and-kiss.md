# Hard code-quality mandate: file-size limit, SOLID, KISS, and separation of concerns

Authored source files sit in roughly the 250 to 450 line range, with 450 a hard cap: split anything that would exceed it. This is a ceiling-and-comfort band, not a quota - smaller files are fine when a unit is genuinely small, and a file is never padded to fill it. Code must be extremely readable and maintainable, modular, and extensible, and must follow the SOLID principles (Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion), KISS (Keep It Simple, Stupid), and separation of concerns throughout. In particular, every file has a single responsibility - one reason to change. Size is never a license to merge concerns. These are hard requirements, not aspirations.

When a file outgrows the cap, that is a signal it is doing too much: split it into smaller units, each with one clear purpose, a narrow interface, and the ability to be understood and tested on its own. This also suits AI-assisted development - small, focused files are easier to reason about and edit reliably.

## SOLID

The SOLID principles are mandatory, applied in a TypeScript / modular idiom:

- **Single responsibility**: every file and unit has one responsibility and one reason to change. This is the headline rule, and it pairs with the file-size limit - a file that does one thing rarely grows large.
- **Open/closed**: units are extended by adding code (new implementations, new registry entries), not by editing stable cores. The provider registry and the Assistant-as-composition-point (ADR 0006) are built this way.
- **Liskov substitution**: implementations of an interface are interchangeable; a consumer never needs to know which concrete type it holds.
- **Interface segregation**: prefer small, focused interfaces over wide ones; a consumer depends only on what it uses.
- **Dependency inversion**: depend on abstractions (typed interfaces), not concretions; inject dependencies (the data directory, the logger, the model) rather than reaching for globals.

## Exemptions

The limit applies to the code we author. Exempt: generated files (drizzle-kit migrations, TanStack route trees), lockfiles, and vendored third-party source (the shadcn/ui and AI Elements components we adopt).

## Enforcement

Where practical, enforce the limit with a linter rule (for example an oxlint `max-lines` rule) and treat a violation as a refactor signal, not a reason to suppress the rule.

We record this because it is a deliberate, strict constraint not visible from any single file, and it shapes the architecture toward many small modules over fewer large ones. A future contributor or agent will otherwise treat large files as acceptable.
