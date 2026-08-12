#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SERVER_NAME = "resultflow-whatsapp";
const SERVER_VERSION = "0.2.0";
const PROTOCOL_VERSION = "2024-11-05";

function objectSchema(properties = {}, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const pagination = {
  cursor: { type: "string", description: "Opaque cursor returned by the previous page." },
  limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
};

const messageKey = {
  remoteJid: { type: "string", description: "WhatsApp chat or group JID." },
  id: { type: "string", description: "WhatsApp message ID." },
  fromMe: { type: "boolean" },
  participant: { type: "string", description: "Group participant JID when applicable." },
};

function definition(name, description, properties, required, handler) {
  return { name, description, inputSchema: objectSchema(properties, required), handler };
}

async function runtimeTool(context, action, input = {}) {
  if (!context || typeof context.callRuntime !== "function") {
    throw userError("ResultFlow is not connected. Run the ResultFlow connection prompt first.");
  }
  return redactSensitive(await context.callRuntime(action, input));
}

function whatsappJid(value) {
  const raw = String(value || "").trim();
  if (raw.includes("@")) return raw;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `60${digits.slice(1)}`;
  return `${digits}@s.whatsapp.net`;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function runtimeMessageKey(args, fallbackJid) {
  return compact({
    remoteJid: args.remoteJid ? whatsappJid(args.remoteJid) : fallbackJid,
    id: args.id,
    fromMe: args.fromMe,
    participant: args.participant ? whatsappJid(args.participant) : undefined,
  });
}

const tools = [
  definition(
    "resultflow_status",
    "Check the connected ResultFlow WhatsApp account and service status.",
    {},
    [],
    async (_args, context) => {
      const runtime = await runtimeTool(context, "status", {});
      const session = context && context.session
        ? { ...context.session, status: runtime.state || context.session.status }
        : undefined;
      return {
        server: SERVER_NAME,
        version: SERVER_VERSION,
        ...(session ? { session } : {}),
        runtime,
      };
    },
  ),
  definition(
    "resultflow_get_connection_state",
    "Get the connection state of this workspace's WhatsApp account.",
    {},
    [],
    (_args, context) => runtimeTool(context, "status", {}),
  ),
  definition(
    "resultflow_restart_whatsapp",
    "Restart this workspace's WhatsApp connection.",
    {},
    [],
    (_args, context) => runtimeTool(context, "restart", {}),
  ),
  definition(
    "resultflow_logout_whatsapp",
    "Log this workspace's WhatsApp account out of the linked-device session.",
    {},
    [],
    (_args, context) => runtimeTool(context, "logout", {}),
  ),
  definition(
    "resultflow_set_presence",
    "Set this WhatsApp account's presence to available or unavailable.",
    { presence: { type: "string", enum: ["available", "unavailable"] } },
    ["presence"],
    (args, context) => runtimeTool(context, "setPresence", args),
  ),
  definition(
    "resultflow_check_whatsapp_numbers",
    "Check whether one or more phone numbers are registered on WhatsApp.",
    {
      numbers: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } },
    },
    ["numbers"],
    (args, context) => runtimeTool(context, "checkNumbers", { numbers: args.numbers }),
  ),
  definition(
    "resultflow_find_contacts",
    "List or search contacts for this WhatsApp account.",
    {
      query: { type: "string", description: "Optional name, phone, or JID search." },
      ...pagination,
    },
    [],
    (args, context) => runtimeTool(context, "contacts", compact({ search: args.query, cursor: args.cursor, limit: args.limit })),
  ),
  definition(
    "resultflow_find_chats",
    "List or search chats for this WhatsApp account.",
    {
      query: { type: "string" },
      archived: { type: "boolean" },
      ...pagination,
    },
    [],
    (args, context) => runtimeTool(context, "chats", compact({ search: args.query, archived: args.archived, cursor: args.cursor, limit: args.limit })),
  ),
  definition(
    "resultflow_find_messages",
    "List or search messages, optionally within one chat.",
    {
      remoteJid: { type: "string" },
      query: { type: "string" },
      before: { type: "string", description: "ISO timestamp upper bound." },
      after: { type: "string", description: "ISO timestamp lower bound." },
      ...pagination,
    },
    [],
    (args, context) => runtimeTool(context, "messages", compact({
      jid: args.remoteJid ? whatsappJid(args.remoteJid) : undefined,
      search: args.query,
      before: args.before,
      after: args.after,
      cursor: args.cursor,
      limit: args.limit,
    })),
  ),
  definition(
    "resultflow_list_groups",
    "List groups visible to this WhatsApp account.",
    {
      query: { type: "string" },
      ...pagination,
    },
    [],
    (args, context) => runtimeTool(context, "groups", compact({ search: args.query, cursor: args.cursor, limit: args.limit })),
  ),
  definition(
    "resultflow_get_group",
    "Get metadata and participants for one WhatsApp group.",
    { groupJid: { type: "string" } },
    ["groupJid"],
    (args, context) => runtimeTool(context, "getGroup", { jid: whatsappJid(args.groupJid) }),
  ),
  definition(
    "resultflow_send_text",
    "Send a text message to a WhatsApp contact or group.",
    {
      number: { type: "string", description: "Recipient phone number or WhatsApp JID." },
      text: { type: "string", minLength: 1, maxLength: 65536 },
      quoted: objectSchema(messageKey, ["remoteJid", "id", "fromMe"]),
      mentions: { type: "array", maxItems: 100, items: { type: "string" } },
    },
    ["number", "text"],
    (args, context) => {
      const jid = whatsappJid(args.number);
      return runtimeTool(context, "sendText", compact({
        jid,
        text: args.text,
        quoted: args.quoted ? runtimeMessageKey(args.quoted, jid) : undefined,
        mentions: args.mentions ? args.mentions.map(whatsappJid) : undefined,
      }));
    },
  ),
  definition(
    "resultflow_send_media",
    "Send an image, video, audio file, or document to a WhatsApp contact or group.",
    {
      number: { type: "string" },
      mediaType: { type: "string", enum: ["image", "video", "audio", "document"] },
      mimeType: { type: "string" },
      media: { type: "string", description: "HTTPS URL or bounded base64 payload." },
      fileName: { type: "string", maxLength: 255 },
      caption: { type: "string", maxLength: 65536 },
    },
    ["number", "mediaType", "mimeType", "media"],
    (args, context) => runtimeTool(context, "sendMedia", compact({
      jid: whatsappJid(args.number),
      kind: args.mediaType,
      mimetype: args.mimeType,
      mediaUrl: /^https:\/\//i.test(args.media) ? args.media : undefined,
      mediaBase64: /^https:\/\//i.test(args.media) ? undefined : args.media,
      fileName: args.fileName,
      caption: args.caption,
    })),
  ),
  definition(
    "resultflow_mark_messages_read",
    "Mark one or more WhatsApp messages as read.",
    {
      messages: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: objectSchema(messageKey, ["remoteJid", "id", "fromMe"]),
      },
    },
    ["messages"],
    (args, context) => runtimeTool(context, "markRead", { keys: args.messages.map(item => runtimeMessageKey(item)) }),
  ),
  definition(
    "resultflow_archive_chat",
    "Archive or unarchive one WhatsApp chat.",
    {
      remoteJid: { type: "string" },
      archive: { type: "boolean" },
      lastMessage: objectSchema({
        ...messageKey,
        messageTimestamp: { type: "integer", minimum: 1 },
      }, ["remoteJid", "id", "fromMe", "messageTimestamp"]),
    },
    ["remoteJid", "archive"],
    (args, context) => {
      const jid = whatsappJid(args.remoteJid);
      return runtimeTool(context, "archiveChat", compact({
        jid,
        archive: args.archive,
        lastMessage: args.lastMessage ? {
          key: runtimeMessageKey(args.lastMessage, jid),
          messageTimestamp: args.lastMessage.messageTimestamp,
        } : undefined,
      }));
    },
  ),
  definition(
    "resultflow_edit_message",
    "Edit an eligible message previously sent by this WhatsApp account.",
    {
      ...messageKey,
      text: { type: "string", minLength: 1, maxLength: 65536 },
    },
    ["remoteJid", "id", "fromMe", "text"],
    (args, context) => {
      const jid = whatsappJid(args.remoteJid);
      return runtimeTool(context, "editMessage", { jid, key: runtimeMessageKey(args, jid), text: args.text });
    },
  ),
  definition(
    "resultflow_delete_message_for_everyone",
    "Delete an eligible WhatsApp message for everyone.",
    messageKey,
    ["remoteJid", "id", "fromMe"],
    (args, context) => {
      const jid = whatsappJid(args.remoteJid);
      return runtimeTool(context, "deleteMessage", {
        jid,
        key: runtimeMessageKey(args, jid),
        forEveryone: true,
      });
    },
  ),
  definition(
    "resultflow_create_group",
    "Create a WhatsApp group with the supplied participants.",
    {
      subject: { type: "string", minLength: 1, maxLength: 100 },
      participants: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } },
    },
    ["subject", "participants"],
    (args, context) => runtimeTool(context, "createGroup", {
      subject: args.subject,
      participants: args.participants.map(whatsappJid),
    }),
  ),
  definition(
    "resultflow_update_group_subject",
    "Update the subject of a WhatsApp group where this account has permission.",
    {
      groupJid: { type: "string" },
      subject: { type: "string", minLength: 1, maxLength: 100 },
    },
    ["groupJid", "subject"],
    (args, context) => runtimeTool(context, "updateGroupSubject", { jid: whatsappJid(args.groupJid), subject: args.subject }),
  ),
  definition(
    "resultflow_update_group_description",
    "Update or clear the description of a WhatsApp group where this account has permission.",
    {
      groupJid: { type: "string" },
      description: { type: "string", maxLength: 2048 },
    },
    ["groupJid", "description"],
    (args, context) => runtimeTool(context, "updateGroupDescription", { jid: whatsappJid(args.groupJid), description: args.description }),
  ),
  definition(
    "resultflow_update_group_participants",
    "Add, remove, promote, or demote WhatsApp group participants where this account has permission.",
    {
      groupJid: { type: "string" },
      operation: { type: "string", enum: ["add", "remove", "promote", "demote"] },
      participants: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } },
    },
    ["groupJid", "operation", "participants"],
    (args, context) => runtimeTool(context, "updateGroupParticipants", {
      jid: whatsappJid(args.groupJid),
      operation: args.operation,
      participants: args.participants.map(whatsappJid),
    }),
  ),
  definition(
    "resultflow_leave_group",
    "Leave a WhatsApp group.",
    { groupJid: { type: "string" } },
    ["groupJid"],
    (args, context) => runtimeTool(context, "leaveGroup", { jid: whatsappJid(args.groupJid) }),
  ),
  definition(
    "resultflow_get_group_invite_code",
    "Get an invite code for a WhatsApp group where this account has permission.",
    { groupJid: { type: "string" } },
    ["groupJid"],
    (args, context) => runtimeTool(context, "getGroupInviteCode", { jid: whatsappJid(args.groupJid) }),
  ),
  definition(
    "resultflow_revoke_group_invite_code",
    "Revoke and replace a WhatsApp group invite code where this account has permission.",
    { groupJid: { type: "string" } },
    ["groupJid"],
    (args, context) => runtimeTool(context, "revokeGroupInviteCode", { jid: whatsappJid(args.groupJid) }),
  ),
];

const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

function userError(message) {
  const error = new Error(message);
  error.isUserError = true;
  return error;
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower.includes("authorization") ||
      lower === "qr" ||
      lower === "runtimeid" ||
      lower === "runtimesessionid" ||
      lower === "runtime_session_id" ||
      lower.includes("authstate")
    ) {
      result[key] = "[redacted]";
    } else {
      result[key] = redactSensitive(item);
    }
  }
  return result;
}

function serializeToolResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function serializeToolError(error) {
  return {
    isError: true,
    content: [{
      type: "text",
      text: JSON.stringify({ error: String(error && error.message || "ResultFlow could not complete this action.").slice(0, 300) }),
    }],
  };
}

async function handleRequest(message, respond = send, context = {}) {
  if (!message || typeof message !== "object") return;
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") return;

  if (message.method === "initialize") {
    respond({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params && message.params.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
    return;
  }
  if (message.method === "ping") {
    respond({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }
  if (message.method === "tools/list") {
    respond({
      jsonrpc: "2.0",
      id: message.id,
      result: { tools: tools.map(({ handler, ...tool }) => tool) },
    });
    return;
  }
  if (message.method === "tools/call") {
    const tool = toolMap.get(message.params && message.params.name);
    if (!tool) {
      respond(errorResponse(message.id, -32602, `Unknown tool: ${message.params && message.params.name}`));
      return;
    }
    try {
      const result = await tool.handler(message.params && message.params.arguments || {}, context);
      respond({ jsonrpc: "2.0", id: message.id, result: serializeToolResult(result) });
    } catch (error) {
      respond({ jsonrpc: "2.0", id: message.id, result: serializeToolError(error) });
    }
    return;
  }
  if (message.id !== undefined) respond(errorResponse(message.id, -32601, `Method not found: ${message.method}`));
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function localConnection(clientId = "codex") {
  const configDir = process.env.RESULTFLOW_CONFIG_DIR
    ? path.resolve(process.env.RESULTFLOW_CONFIG_DIR)
    : path.join(os.homedir(), ".resultflow");
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(path.join(configDir, "mcp.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") return {};
  }
  const selected = stored.clients && stored.clients[clientId] ? stored.clients[clientId] : stored;
  const mcpToken = String(process.env.RESULTFLOW_MCP_TOKEN || selected.mcpToken || "").trim();
  const mcpUrl = String(process.env.RESULTFLOW_MCP_URL || selected.mcpUrl || "").trim();
  if (!mcpToken || !/^https:\/\//i.test(mcpUrl)) return {};
  return { mcpToken, mcpUrl };
}

async function relayRemoteMessage(message, connection, fetchImpl = fetch) {
  const response = await fetchImpl(connection.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.mcpToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(message),
  });
  if (response.status === 202 || response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;
  const remoteError = typeof data.error === "string"
    ? data.error
    : data.error && (data.error.message || data.error.code);
  return errorResponse(
    message.id === undefined ? null : message.id,
    -32000,
    String(data.message || remoteError || `ResultFlow returned HTTP ${response.status}`).slice(0, 300),
  );
}

function runStdio() {
  let buffer = "";
  let chain = Promise.resolve();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        send(errorResponse(null, -32700, "Parse error"));
        continue;
      }
      chain = chain.then(async () => {
        const clientId = String(process.env.RESULTFLOW_AI_CLIENT || "codex").trim();
        const connection = localConnection(clientId);
        if (connection.mcpToken) {
          const result = await relayRemoteMessage(message, connection);
          if (result) send(result);
          return;
        }
        await handleRequest(message);
      }).catch((error) => {
        if (message.id !== undefined) send(errorResponse(message.id, -32603, error.message || "Internal error"));
      });
    }
  });
  process.stdin.on("end", () => chain.finally(() => process.exit(0)));
}

if (require.main === module) runStdio();

module.exports = {
  handleRequest,
  localConnection,
  redactSensitive,
  relayRemoteMessage,
  runStdio,
  tools: tools.map(({ handler, ...tool }) => tool),
};
