# ResultFlow WhatsApp

Workspace-scoped WhatsApp tools for Codex.

## Customer setup

1. Complete ResultFlow checkout and scan the WhatsApp QR shown in onboarding.
2. Press **Copy Codex prompt**.
3. Paste and send that prompt in Codex.

The prompt claims a short-lived setup code, stores a revocable MCP credential in the current user's `.resultflow` directory, and registers the ResultFlow relay. Customers do not paste API keys or edit MCP configuration.

The plugin can also be installed from the ResultFlow Git marketplace for operator testing. Installing it does not grant WhatsApp access; a paid workspace setup prompt is still required.

## Available tools

The plugin exposes connection state, chats, messages, contacts, number checks, groups, text/media sending, read/archive actions, message edit/delete, group create/update/participant/leave/invite actions, presence, restart, and logout. Every call is bound server-side to the WhatsApp session selected during setup.

There is no caller-controlled workspace, runtime ID, service token, or ResultFlow confirmation flag. Provider permissions and WhatsApp behavior still apply.

## Product support

The current published setup path supports Codex, Claude Code, Gemini CLI, and the ResultFlow DeepSeek bridge. ChatGPT Work requires the separate public remote-plugin OAuth integration and must not be presented as generally available until that validation is complete.
