#!/usr/bin/env node
"use strict";

const { loadConfig } = require("../lib/config");

const clientFlag = process.argv.indexOf("--client");
const clientId = clientFlag >= 0 ? process.argv[clientFlag + 1] : "";
const config = loadConfig(clientId);
if (!config.mcpToken) {
  console.error("ResultFlow is not connected. Run the ResultFlow connect command with a fresh setup code.");
  process.exit(1);
}

async function relay(message) {
  const response = await fetch(config.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.mcpToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(message),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 202 || response.status === 204) return null;
  if (!response.ok) {
    return {
      jsonrpc: "2.0",
      id: message.id === undefined ? null : message.id,
      error: {
        code: -32000,
        message: data.message || data.error || `ResultFlow returned HTTP ${response.status}`,
      },
    };
  }
  return data;
}

let buffer = "";
let chain = Promise.resolve();
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    newlineIndex = buffer.indexOf("\n");
    if (!line) continue;
    chain = chain.then(async () => {
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`);
        return;
      }
      const result = await relay(message);
      if (result) process.stdout.write(`${JSON.stringify(result)}\n`);
    }).catch(error => {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error.message || "Relay error" } })}\n`);
    });
  }
});

process.stdin.on("end", () => {
  chain.finally(() => process.exit(0));
});

module.exports = { relay };
