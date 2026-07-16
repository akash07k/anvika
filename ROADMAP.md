# Roadmap

Anvika is an accessible AI application built for screen-reader and keyboard users, because the
tools in this space are not accessible enough for us. We are growing it from an accessible chat
client into a full accessible AI workspace - assistants, skills, tools, retrieval, and voice -
without ever compromising on the keyboard and screen-reader experience. This roadmap describes the
feature themes we are heading toward, grouped roughly in the order we expect to reach them.

- Accessible single and multi-conversation chat. The foundation, available today: a fully
  keyboard-driven, screen-reader-first chat over cloud Providers and your own local server, with
  conversations that persist across reloads.
- A rich in-chat model picker, conversation organization with tags and search, conversation export,
  and a command palette. These make a growing collection of conversations easy to navigate and a
  Model easy to switch without leaving the keyboard.
- Image and document attachments, so a conversation can include the files and pictures you want the
  Model to work with.
- Custom Assistants and a prompt library. An Assistant is a reusable bundle of instructions, a
  default Model, and generation settings; the prompt library keeps your frequently used prompts a
  keystroke away.
- Tools and MCP, with web search arriving as a tool. Assistants gain the ability to call functions
  and connect to MCP servers so they can act, not just answer.
- Skills, a model-agnostic Skills runtime. A Skill is a loadable package that extends an Assistant
  with packaged instructions and resources through progressive disclosure.
- Retrieval and knowledge bases (RAG), so an Assistant can ground its answers in document
  collections you provide.
- Voice, covering both speech-to-text for dictating your messages and text-to-speech for hearing
  responses read aloud.
- Advanced generation, including image output and comparing several models side by side on the same
  prompt.
- Hardening and an optional desktop wrapper for a more integrated local experience.

This roadmap is directional rather than a commitment, and the order and contents may change as we
learn. One thing that will not change: Anvika is an orchestration layer, so its scope deliberately
excludes running or hosting models itself (ADR 0005). It connects to cloud Providers and to a local
server you already run; it never bundles an inference engine or manages model weights.
