# Anvika orchestrates models; it does not run them

Anvika is an accessible AI application (Jan/OpenWebUI class) that is a client and orchestration layer over AI models - cloud providers (Anthropic, OpenAI, Google, Azure, OpenRouter) and the user's own already-running local server (LM Studio / llama.cpp / Ollama via the openai-compatible API). It is not a model runtime.

Explicit, permanent non-goals: Anvika does not bundle or embed an inference engine, does not download or manage model weights, and does not serve or run models on CPU or GPU. A "managed local runtime" - Anvika spawning or supervising Ollama or similar - is out of scope, permanently.

We record this because "why doesn't Anvika just run models like Jan does?" is a question contributors will keep raising. Running models is a different product (a model host) with a large, platform-specific surface: packaging inference engines, GPU drivers, and weight management. Anvika's value is the accessible orchestration experience on top of models supplied by others; the user already runs their own local server.

## Consequences

- The provider registry and per-provider credentials (ADR 0004) are the entire model-access surface; there is no inference subsystem.
- Local models are reached only through the user's openai-compatible endpoint; Anvika never owns a model process.
