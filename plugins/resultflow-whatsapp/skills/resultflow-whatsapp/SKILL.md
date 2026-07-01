---
name: resultflow-whatsapp
description: Use when the user wants to operate ResultFlow WhatsApp automation through MCP, including sending WhatsApp messages, managing instances, reading chats/messages/contacts, configuring webhooks/settings, or building summary and follow-up workflows.
---

# ResultFlow WhatsApp

Use this skill when the task involves the user's ResultFlow WhatsApp workspace.

## Server Assumptions

- Manager/dashboard URL: `https://wa.resultmarketing.asia/manager`
- API base URL: `https://wa.resultmarketing.asia`
- Authentication header: `apikey`
- The user may paste the API key for the current task. Do not store it in files, plans, logs, or plugin config.
- The MCP tools accept `apiKey` per call and also support `RESULTFLOW_API_KEY` as a fallback for future recurring automations.

## Tool Use Rules

1. Prefer the named MCP tools over inventing endpoint paths.
2. If the user pastes an API key, pass it as `apiKey` only to the needed MCP tool calls.
3. If the instance name is unknown, call `resultflow_list_instances` first.
4. Treat the user's instruction as the operation intent. Create, read, update, delete, and send operations are available through the authenticated tools.
5. For "text myself", use the default recipient only when configured; otherwise ask for the recipient number.
6. Treat chat/message/contact data as private. Retrieve only what is needed for the requested task.

## Common Flows

- Check setup: `resultflow_status`, then `resultflow_list_instances`.
- Send an update: `resultflow_get_connection_state`, then `resultflow_send_text`.
- Daily summary: `resultflow_find_chats` and targeted `resultflow_find_messages`, then summarize relevant activity.
- Automation webhook: `resultflow_get_webhook`, then `resultflow_set_webhook` with documented events.
- Settings update: call `resultflow_get_settings` first, then `resultflow_set_settings` with only intended changes.

## Credential Handling

- Never commit or save API keys.
- Redacted responses are normal; request sensitive output only when the user explicitly needs a returned instance token.
