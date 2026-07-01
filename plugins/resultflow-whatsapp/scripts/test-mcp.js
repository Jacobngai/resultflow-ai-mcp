#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const serverPath = path.join(__dirname, "..", "mcp-server", "index.js");
const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

const requests = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "local-test", version: "0.0.0" },
    },
  },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "resultflow_status",
      arguments: {},
    },
  },
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "resultflow_list_instances",
      arguments: {},
    },
  },
  {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "resultflow_set_webhook",
      arguments: {
        apiKey: "test-key",
        instance: "test-instance",
        enabled: true,
        url: "http://127.0.0.1:3093/webhook/resultflow",
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT"],
        dryRun: true,
      },
    },
  },
];

let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

child.on("close", (code) => {
  if (stderr.trim()) {
    console.error(stderr.trim());
  }

  const responses = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const initialize = responses.find((item) => item.id === 1);
  const list = responses.find((item) => item.id === 2);
  const status = responses.find((item) => item.id === 3);
  const missingKey = responses.find((item) => item.id === 4);
  const webhookDryRun = responses.find((item) => item.id === 5);

  if (!initialize?.result?.serverInfo) {
    throw new Error("initialize response missing serverInfo");
  }
  if (!Array.isArray(list?.result?.tools) || list.result.tools.length < 10) {
    throw new Error("tools/list response missing expected tools");
  }
  if (!status?.result?.content?.[0]?.text?.includes("resultflow-whatsapp")) {
    throw new Error("status tool did not return MCP status");
  }
  if (!missingKey?.result?.isError) {
    throw new Error("missing-key list_instances call should return a tool error");
  }
  const webhookText = webhookDryRun?.result?.content?.[0]?.text || "";
  const webhookPayload = JSON.parse(webhookText);
  if (!webhookPayload?.wouldRequest?.body?.webhook?.url) {
    throw new Error("webhook dry-run should nest fields under body.webhook");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        exitCode: code,
        toolCount: list.result.tools.length,
        missingKeyHandled: true,
        webhookPayloadNested: true,
      },
      null,
      2,
    ),
  );
});

for (const request of requests) {
  child.stdin.write(`${JSON.stringify(request)}\n`);
}
child.stdin.end();
