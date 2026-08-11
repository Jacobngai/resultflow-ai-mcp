#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const { loadConfig } = require("../lib/config");

function endpoint(baseUrl) {
  return `${String(baseUrl || "https://api.deepseek.com").replace(/\/+$/, "")}/chat/completions`;
}

async function mcpRequest(config, message, fetchImpl = fetch) {
  const response = await fetchImpl(config.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.mcpToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `ResultFlow returned HTTP ${response.status}`);
  return data;
}

function deepSeekTools(mcpTools) {
  return mcpTools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "ResultFlow WhatsApp tool",
      parameters: tool.inputSchema || { type: "object", properties: {} },
    },
  }));
}

async function complete({ apiKey, model, baseUrl, messages, tools, fetchImpl = fetch }) {
  const response = await fetchImpl(endpoint(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || (data.error && data.error.message) || `DeepSeek returned HTTP ${response.status}`);
  const message = data.choices && data.choices[0] && data.choices[0].message;
  if (!message) throw new Error("DeepSeek did not return a message.");
  return message;
}

async function runTurn(context, prompt, fetchImpl = fetch) {
  context.messages.push({ role: "user", content: prompt });
  for (let round = 0; round < 10; round += 1) {
    const assistant = await complete({ ...context, fetchImpl });
    context.messages.push(assistant);
    const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
    if (!calls.length) return assistant.content || "";
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch (error) {}
      const response = await mcpRequest(context.config, {
        jsonrpc: "2.0",
        id: `${Date.now()}-${Math.random()}`,
        method: "tools/call",
        params: { name: call.function.name, arguments: args },
      }, fetchImpl);
      context.messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(response.result || response.error || response),
      });
    }
  }
  throw new Error("DeepSeek reached the ResultFlow tool-call limit for this request.");
}

async function createContext(fetchImpl = fetch) {
  const config = loadConfig("deepseek_bridge");
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!config.mcpToken) throw new Error("DeepSeek is not connected to ResultFlow. Use a fresh setup code first.");
  if (!apiKey) throw new Error("Set DEEPSEEK_API_KEY in your local environment. It is never sent to ResultFlow.");
  const list = await mcpRequest(config, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, fetchImpl);
  return {
    config,
    apiKey,
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    baseUrl: process.env.DEEPSEEK_API_BASE_URL || "https://api.deepseek.com",
    tools: deepSeekTools(list.result && list.result.tools ? list.result.tools : []),
    messages: [{
      role: "system",
      content: "You are ResultFlow for DeepSeek. Use the ResultFlow MCP tools for the user's WhatsApp request. Perform create, update, and delete actions when the user explicitly requests them, and report the actual tool result.",
    }],
  };
}

async function main() {
  const context = await createContext();
  const initial = process.argv.slice(2).join(" ").trim();
  if (initial) {
    console.log(await runTurn(context, initial));
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("ResultFlow DeepSeek Bridge. Type exit to close.");
  const ask = () => rl.question("> ", async input => {
    const prompt = input.trim();
    if (!prompt || /^(exit|quit)$/i.test(prompt)) return rl.close();
    try { console.log(await runTurn(context, prompt)); } catch (error) { console.error(error.message); }
    ask();
  });
  ask();
}

module.exports = { complete, createContext, deepSeekTools, endpoint, main, mcpRequest, runTurn };
