# ResultFlow AI MCP

One ResultFlow WhatsApp MCP toolset for Codex, Claude Code, Gemini CLI, and the ResultFlow DeepSeek Bridge.

## Connect

Create a short-lived setup code in the ResultFlow dashboard, then run:

```bash
npx -y github:Jacobngai/resultflow-ai-mcp connect --client codex --code RF_SETUP_REPLACE_ME
```

Use `claude_code`, `gemini_cli`, or `deepseek_bridge` for the other supported clients. The setup code is single-use. The installer stores a scoped ResultFlow MCP credential in the current user's `.resultflow` folder and never downloads the shared WhatsApp API key.

DeepSeek uses the customer's local `DEEPSEEK_API_KEY`:

```bash
npx -y github:Jacobngai/resultflow-ai-mcp deepseek
```

The DeepSeek key is sent only to the configured DeepSeek API endpoint and is not sent to ResultFlow.
