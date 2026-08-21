# Build Plan

## Shipped foundation

- [x] 1. **Shared Contract and API foundation** - provide the versioned Hono API,
  shared Zod schemas, canonical errors, and local persistence boundary.
- [x] 2. **Accessible streamed chat** - deliver keyboard-first, screen-reader-aware
  chat over configured cloud Providers and an already-running local server.
- [x] 3. **Provider, model, and settings management** - configure connections,
  discover and select models, and apply generation preferences safely.
- [x] 4. **Multi-conversation management** - create, load, rename, pin, branch,
  delete, and restore persisted conversations with optimistic concurrency.
- [x] 5. **Per-conversation generation controls** - support model and reasoning
  overrides while preserving Server-side resolution rules.
- [x] 6. **Local operation and quality infrastructure** - provide diagnostics,
  content-safe logging, automated verification, end-to-end accessibility checks, and
  standalone binary packaging.

## Stabilization before product roadmap

- [ ] 7. **Dependency modernization** - update the project's dependencies as one
  coordinated compatibility effort while preserving the API-first architecture and
  accessibility contract. Use `migrate-ai-sdk-v6-to-v7` for the AI SDK v6-to-v7
  portion of this work.
- [ ] 8. **Existing and post-upgrade bug fixes** - repair known existing bugs after
  dependency modernization, plus migration regressions found during that work.
- [ ] 9. **Existing-experience enhancements** - improve the current implementation
  based on the enhancement requests that follow the dependency and bug-fix work.

> TODO (confirm): Add the specific existing-bug reports and enhancement outcomes
> before specing items 8 and 9.

## Product roadmap

> TODO (confirm): Items 10 through 17 reflect the current `ROADMAP.md` themes, but
> their order should be reconsidered after stabilization work is complete.

- [ ] 10. **Image and document attachments** - let conversations include files and
  images for a Model to process.
- [ ] 11. **Custom Assistants and prompt library** - create reusable instruction,
  model, and generation-setting bundles with reusable prompts.
- [ ] 12. **Tools and MCP** - let Assistants invoke functions, connect to MCP
  servers, and use web search as a tool.
- [ ] 13. **Skills runtime** - load model-agnostic Skill packages with packaged
  instructions and resources.
- [ ] 14. **Retrieval and knowledge bases** - ground Assistants in user-provided
  document collections.
- [ ] 15. **Voice interaction** - add speech-to-text input and text-to-speech
  output without weakening the existing accessibility contract.
- [ ] 16. **Advanced generation** - support image output and side-by-side
  comparisons across Models.
- [ ] 17. **Hardening and optional desktop wrapper** - improve operational
  resilience and evaluate a more integrated desktop experience.
