---
name: resultflow-whatsapp
description: Use when the user wants to work with their connected ResultFlow WhatsApp account, including chats, messages, contacts, groups, summaries, replies, and supported CRUD actions.
---

# ResultFlow WhatsApp

Use this skill when the task involves the user's ResultFlow WhatsApp workspace.

## Connection Assumptions

- ResultFlow onboarding issues a short-lived, single-use setup code after payment and WhatsApp connection.
- The copied setup prompt stores a scoped, revocable MCP credential in the current user's `.resultflow` directory.
- Never ask the user for a shared WhatsApp API key, Baileys auth files, or a raw QR payload.
- If a tool reports that ResultFlow is not connected, direct the user back to ResultFlow onboarding for a fresh setup prompt.

## Tool Use Rules

1. Prefer the named MCP tools over inventing endpoint paths.
2. Call `resultflow_status` when connection state matters.
3. Treat the user's instruction as the operation intent. Do not add a separate ResultFlow confirmation parameter.
4. For "text myself", ask for the recipient number when it is not clear from context.
5. Treat chat, message, contact, and group data as private. Retrieve only what is needed for the requested task.

## Common Flows

- Check setup: `resultflow_status`, then `resultflow_get_connection_state`.
- Send an update: `resultflow_get_connection_state`, then `resultflow_send_text`.
- Daily summary: `resultflow_find_chats` and targeted `resultflow_find_messages`, then summarize relevant activity.
- Group work: use `resultflow_list_groups`, `resultflow_get_group`, and the specific group action requested.

## Credential Handling

- Never reveal, copy, or log the scoped MCP credential.
- Never request or expose Baileys auth state or QR contents.
