# Custom Assistants are the composition point; Skills are a model-agnostic runtime

A Custom Assistant is a named, reusable bundle of: instructions (its system prompt), a default model and generation parameters, the tools/MCP servers it may use, the Skills it loads, and its knowledge/RAG sources. A built-in Default assistant (a model plus blank instructions) always exists, and every conversation records which Assistant it used.

The Assistant is the composition point for Anvika's capabilities. Rather than bolting tools, skills, and knowledge onto raw chat, each capability attaches to the Assistant. Assistants are introduced **progressively**: a basic Assistant (instructions + model + parameters) arrives early on the roadmap, and each later capability (tools/MCP, Skills, retrieval) adds a dimension to the Assistant model - rather than one large late "assemble everything" effort.

Skills are loadable packages in the Claude Agent Skills format (a `SKILL.md` plus optional resources and scripts, surfaced by progressive disclosure). Anvika implements its own Skills runtime that is **model-agnostic** - Skills work across every provider and model, not only Claude. A Skill differs from MCP: MCP exposes callable tools over a protocol; a Skill injects packaged instructions and resources. Both attach to an Assistant.

## Considered Options

- A dedicated late Assistants effort that bundles tools, Skills, and knowledge at once: rejected. Progressive enrichment makes the Assistant first-class earlier and keeps each step focused and testable.
- Skills only when a Claude model is selected: rejected. It would undercut the model-agnostic core (ADR 0004).

## Consequences

- The Assistant data model is extensible by design: adding a capability means adding a dimension to the Assistant, not introducing a new top-level concept.
- The Skills runtime is Anvika's own, compatible with the Claude Agent Skills format, and works under any provider.
