const assert = require("node:assert/strict");
const test = require("node:test");
const { deepSeekTools, endpoint, runTurn } = require("../bin/resultflow-deepseek");

test("DeepSeek receives the canonical MCP schemas as function tools", () => {
  const converted = deepSeekTools([{ name: "resultflow_status", description: "Status", inputSchema: { type: "object" } }]);
  assert.deepEqual(converted[0], {
    type: "function",
    function: { name: "resultflow_status", description: "Status", parameters: { type: "object" } },
  });
  assert.equal(endpoint("https://api.deepseek.com/"), "https://api.deepseek.com/chat/completions");
});

test("DeepSeek tool calls are executed through ResultFlow MCP before the final answer", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    if (String(url).includes("resultflow.test")) {
      return { ok: true, status: 200, json: async () => ({ result: { content: [{ type: "text", text: "connected" }] } }) };
    }
    const usedTool = body.messages.some(message => message.role === "tool");
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: usedTool
        ? { role: "assistant", content: "ResultFlow is connected." }
        : { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "resultflow_status", arguments: "{}" } }] } }] }),
    };
  };
  const context = {
    config: { mcpUrl: "https://resultflow.test/api/mcp", mcpToken: "local-test" },
    apiKey: "deepseek-test",
    model: "deepseek-test",
    baseUrl: "https://deepseek.test",
    tools: deepSeekTools([{ name: "resultflow_status", inputSchema: { type: "object" } }]),
    messages: [],
  };
  const answer = await runTurn(context, "Check ResultFlow", fetchImpl);
  assert.equal(answer, "ResultFlow is connected.");
  assert.equal(requests.filter(item => String(item.url).includes("deepseek.test")).length, 2);
  assert.equal(requests.filter(item => String(item.url).includes("resultflow.test")).length, 1);
});
