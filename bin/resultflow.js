#!/usr/bin/env node
"use strict";

const command = String(process.argv[2] || "").toLowerCase();
process.argv.splice(2, 1);

if (command === "connect") {
  require("./resultflow-connect").main().catch(fail);
} else if (command === "relay") {
  require("./resultflow-mcp-relay");
} else if (command === "deepseek") {
  require("./resultflow-deepseek").main().catch(fail);
} else {
  console.log([
    "ResultFlow AI MCP",
    "",
    "Commands:",
    "  resultflow connect --client <codex|claude_code|gemini_cli|deepseek_bridge> --code <setup-code>",
    "  resultflow relay --client <client-id>",
    "  resultflow deepseek [prompt]",
  ].join("\n"));
}

function fail(error) {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
}
