# CellLab — GitHub Copilot Instructions

Follow the project rules in the root `AGENTS.md`, including the Ponytail lazy senior developer principles and multi-agent collaboration agreements.

Before editing, inspect the relevant source code, callers, tests, configuration, and dependencies. Prefer the smallest complete change that fits the existing architecture.

Do not add unnecessary abstractions, dependencies, features, or configuration. Preserve validation, error handling, security, accessibility, and scientific correctness.

Respect Clean Architecture boundaries: React UI must not invoke Tauri commands directly; route all backend communication through `src/adapters/` (`IpcBridge` / `TauriIpcAdapter`). Ensure command names and JSON-RPC payloads are agreed upon before writing handlers.

Validate non-trivial changes with an appropriate test or self-check. Report actual changes, checks performed, anything skipped or not checked, and material risks.

Treat project files as the source of truth. Do not assume access to other agents' chat histories. Do not invent implementation details or claim tests passed without evidence.
