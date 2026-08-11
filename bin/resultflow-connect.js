#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { saveClientConfig } = require("../lib/config");

const CLIENTS = new Set(["codex", "claude_code", "gemini_cli", "deepseek_bridge"]);
const PACKAGE_SOURCE = process.env.RESULTFLOW_PACKAGE_SOURCE || "github:Jacobngai/resultflow-ai-mcp";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

function runnerCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function relayCommand(clientId) {
  return [runnerCommand(), ["-y", PACKAGE_SOURCE, "relay", "--client", clientId]];
}

function registrationCommands(clientId) {
  const [runner, relayArgs] = relayCommand(clientId);
  if (clientId === "codex") {
    return [
      { command: "codex", args: ["mcp", "remove", "resultflow-whatsapp"], optional: true },
      { command: "codex", args: ["mcp", "add", "resultflow-whatsapp", "--", runner, ...relayArgs] },
    ];
  }
  if (clientId === "claude_code") {
    return [
      { command: "claude", args: ["mcp", "remove", "-s", "user", "resultflow-whatsapp"], optional: true },
      { command: "claude", args: ["mcp", "add", "-s", "user", "resultflow-whatsapp", "--", runner, ...relayArgs] },
    ];
  }
  if (clientId === "gemini_cli") {
    return [
      { command: "gemini", args: ["mcp", "remove", "-s", "user", "resultflow-whatsapp"], optional: true },
      { command: "gemini", args: ["mcp", "add", "-s", "user", "resultflow-whatsapp", runner, ...relayArgs] },
    ];
  }
  return [];
}

function runRegistration(clientId) {
  for (const step of registrationCommands(clientId)) {
    const result = spawnSync(step.command, step.args, { stdio: step.optional ? "ignore" : "inherit", shell: false });
    if (result.error && step.optional) continue;
    if (result.error) throw new Error(`${step.command} is not installed or is not available on PATH.`);
    if (result.status !== 0 && !step.optional) throw new Error(`Could not register ResultFlow in ${clientId}.`);
  }
}

async function claimSetupCode(setupCode, clientId, claimUrl) {
  const response = await fetch(claimUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setup_code: setupCode, client_id: clientId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.mcp_token) {
    throw new Error(data.message || "This ResultFlow setup code could not be connected.");
  }
  return data;
}

async function main() {
  const clientId = argument("client");
  const setupCode = argument("code");
  const claimUrl = process.env.RESULTFLOW_CLAIM_URL || "https://resultflow.asia/api/integrations/setup-codes/claim";
  if (!CLIENTS.has(clientId)) throw new Error("Choose codex, claude_code, gemini_cli, or deepseek_bridge.");
  if (!setupCode) throw new Error("A ResultFlow setup code is required.");

  const connection = await claimSetupCode(setupCode, clientId, claimUrl);
  saveClientConfig(clientId, {
    mcpToken: connection.mcp_token,
    mcpUrl: connection.mcp_url,
    workspaceId: connection.workspace_id,
    instanceName: connection.instance_name,
  });

  if (clientId !== "deepseek_bridge" && argument("skip-register") !== "1") {
    runRegistration(clientId);
  }

  const label = {
    codex: "Codex",
    claude_code: "Claude Code",
    gemini_cli: "Gemini CLI",
    deepseek_bridge: "ResultFlow DeepSeek Bridge",
  }[clientId];
  console.log(`${label} is connected to ResultFlow.`);
  if (clientId === "deepseek_bridge") {
    console.log(`Start it with: npx -y ${PACKAGE_SOURCE} deepseek`);
  } else {
    console.log("Start a new AI session, then ask: Use ResultFlow WhatsApp.");
  }
}

module.exports = { claimSetupCode, main, registrationCommands, relayCommand, runRegistration };
