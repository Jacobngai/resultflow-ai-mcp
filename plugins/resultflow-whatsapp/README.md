# ResultFlow WhatsApp Codex Plugin

Codex plugin and MCP tools for ResultFlow WhatsApp automation.

## Install From A Git Marketplace

After this folder is pushed to a Git repository, users can add the marketplace:

```bash
codex plugin marketplace add https://github.com/resultflow/codex-marketplace.git
codex plugin add resultflow-whatsapp@resultflow
```

For local testing from this folder:

```bash
codex plugin marketplace add .
codex plugin add resultflow-whatsapp@resultflow
```

Start a new Codex thread after installation so Codex loads the plugin tools.

## Configuration

The plugin defaults to:

- API base URL: `https://wa.resultmarketing.asia`
- Manager URL: `https://wa.resultmarketing.asia/manager`

Each MCP tool accepts `apiKey` for the current request. For recurring automations, set these optional environment variables in the MCP config or host environment:

- `RESULTFLOW_API_KEY`
- `RESULTFLOW_API_DEFAULT_INSTANCE`
- `RESULTFLOW_API_DEFAULT_RECIPIENT`
- `RESULTFLOW_API_TIMEOUT_MS`
- `RESULTFLOW_API_DRY_RUN`

Do not save API keys in this repository or plugin source.

## Main Tools

- `resultflow_status`
- `resultflow_list_instances`
- `resultflow_create_instance`
- `resultflow_connect_instance`
- `resultflow_get_connection_state`
- `resultflow_restart_instance`
- `resultflow_logout_instance`
- `resultflow_delete_instance`
- `resultflow_set_presence`
- `resultflow_send_text`
- `resultflow_send_media`
- `resultflow_check_whatsapp_numbers`
- `resultflow_find_contacts`
- `resultflow_find_chats`
- `resultflow_find_messages`
- `resultflow_mark_messages_read`
- `resultflow_archive_chat`
- `resultflow_delete_message_for_everyone`
- `resultflow_get_webhook`
- `resultflow_set_webhook`
- `resultflow_get_settings`
- `resultflow_set_settings`

## Website Fallback Messages

If Codex is not installed:

> ResultFlow for Codex runs inside the Codex app or CLI. Install Codex first, sign in, then run the marketplace install command. ResultFlow will not access your WhatsApp workspace until you provide your API key or configure credentials.

If the plugin is not installed:

> ResultFlow WhatsApp is not installed in Codex yet. Add the ResultFlow marketplace, install `resultflow-whatsapp`, then start a new Codex thread.
