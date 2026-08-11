const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  localConnection,
  relayRemoteMessage,
} = require("../plugins/resultflow-whatsapp/mcp-server/index");

test("installed plugin loads only the selected scoped MCP connection", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "resultflow-plugin-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const original = process.env.RESULTFLOW_CONFIG_DIR;
  process.env.RESULTFLOW_CONFIG_DIR = directory;
  t.after(() => restoreEnv("RESULTFLOW_CONFIG_DIR", original));
  fs.writeFileSync(path.join(directory, "mcp.json"), JSON.stringify({
    version: 1,
    clients: {
      codex: {
        mcpToken: "rfm_test_scoped_token",
        mcpUrl: "https://resultflow.asia/api/mcp",
      },
      claude_code: {
        mcpToken: "rfm_other_client",
        mcpUrl: "https://resultflow.asia/api/mcp",
      },
    },
  }));

  assert.deepEqual(localConnection("codex"), {
    mcpToken: "rfm_test_scoped_token",
    mcpUrl: "https://resultflow.asia/api/mcp",
  });
});

test("installed plugin relays JSON-RPC with bearer auth and returns safe remote errors", async () => {
  const connection = { mcpToken: "rfm_test", mcpUrl: "https://resultflow.asia/api/mcp" };
  const message = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  const calls = [];
  const result = await relayRemoteMessage(message, connection, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ error: { code: "workspace_revoked", message: "Access ended." } }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  });

  assert.equal(calls[0].url, connection.mcpUrl);
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${connection.mcpToken}`);
  assert.deepEqual(JSON.parse(calls[0].options.body), message);
  assert.equal(result.error.message, "Access ended.");
});

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
