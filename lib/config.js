#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function configDir() {
  return process.env.RESULTFLOW_CONFIG_DIR
    ? path.resolve(process.env.RESULTFLOW_CONFIG_DIR)
    : path.join(os.homedir(), ".resultflow");
}

function configPath() {
  return path.join(configDir(), "mcp.json");
}

function readStoredConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {};
  }
}

function loadConfig(clientId) {
  const envToken = String(process.env.RESULTFLOW_MCP_TOKEN || "").trim();
  const envUrl = String(process.env.RESULTFLOW_MCP_URL || "").trim();
  const stored = readStoredConfig();
  const selectedId = String(clientId || process.env.RESULTFLOW_AI_CLIENT || stored.defaultClientId || "").trim();
  const selected = stored.clients && selectedId ? stored.clients[selectedId] || {} : stored;
  return {
    mcpToken: envToken || String(selected.mcpToken || "").trim(),
    mcpUrl: envUrl || String(selected.mcpUrl || "https://resultflow.asia/api/mcp").trim(),
    clientId: selectedId || String(selected.clientId || "").trim(),
    workspaceId: String(selected.workspaceId || "").trim(),
    instanceName: String(selected.instanceName || "").trim(),
  };
}

function saveConfig(config) {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try { fs.chmodSync(configPath(), 0o600); } catch (error) {}
  return configPath();
}

function saveClientConfig(clientId, config) {
  const stored = readStoredConfig();
  return saveConfig({
    version: 1,
    defaultClientId: clientId,
    clients: {
      ...(stored.clients || {}),
      [clientId]: { ...config, clientId },
    },
  });
}

module.exports = { configDir, configPath, loadConfig, saveClientConfig, saveConfig };
