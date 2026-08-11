const assert = require("node:assert/strict");
const test = require("node:test");
const { registrationCommands, relayCommand } = require("../bin/resultflow-connect");

test("all native MCP clients register the same ResultFlow relay", () => {
  for (const clientId of ["codex", "claude_code", "gemini_cli"]) {
    const commands = registrationCommands(clientId);
    assert.equal(commands.length, 2);
    const add = commands[1];
    assert.ok(add.args.includes("resultflow-whatsapp"));
    assert.ok(add.args.includes("relay"));
    assert.ok(add.args.includes(clientId));
  }
  assert.deepEqual(registrationCommands("deepseek_bridge"), []);
});

test("relay command is provider-specific only for local credential selection", () => {
  const [command, args] = relayCommand("claude_code");
  assert.match(command, /^npx(?:\.cmd)?$/);
  assert.deepEqual(args.slice(-3), ["relay", "--client", "claude_code"]);
});
