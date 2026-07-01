#!/usr/bin/env node
"use strict";

const DEFAULT_BASE_URL = "https://wa.resultmarketing.asia";
const DEFAULT_TIMEOUT_MS = 30000;
const SERVER_NAME = "resultflow-whatsapp";
const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2024-11-05";

const WEBHOOK_EVENTS = [
  "APPLICATION_STARTUP",
  "QRCODE_UPDATED",
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "SEND_MESSAGE",
  "CONTACTS_SET",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "PRESENCE_UPDATE",
  "CHATS_SET",
  "CHATS_UPSERT",
  "CHATS_UPDATE",
  "CHATS_DELETE",
  "GROUPS_UPSERT",
  "GROUP_UPDATE",
  "GROUP_PARTICIPANTS_UPDATE",
  "CONNECTION_UPDATE",
  "CALL",
  "NEW_JWT_TOKEN",
  "TYPEBOT_START",
  "TYPEBOT_CHANGE_STATUS",
];

const commonProperties = {
  apiKey: {
    type: "string",
    description:
      "ResultFlow WhatsApp API key for this request. If omitted, the server uses RESULTFLOW_API_KEY from the environment.",
  },
  baseUrl: {
    type: "string",
    description:
      "ResultFlow WhatsApp API base URL. Defaults to https://wa.resultmarketing.asia. If /manager is provided it is normalized to the API root.",
  },
};

const instanceProperty = {
  instance: {
    type: "string",
    description:
      "ResultFlow instance name. If omitted, RESULTFLOW_API_DEFAULT_INSTANCE is used when configured.",
  },
};

const includeSensitiveProperty = {
  includeSensitive: {
    type: "boolean",
    description:
      "Return sensitive values such as instance tokens when the API includes them. Defaults to false and redacts secrets.",
  },
};

const dryRunProperty = {
  dryRun: {
    type: "boolean",
    description:
      "Build the request without sending it. Defaults to RESULTFLOW_API_DRY_RUN for write operations, otherwise false.",
  },
};

const maxItemsProperty = {
  maxItems: {
    type: "integer",
    minimum: 1,
    maximum: 500,
    description:
      "Limit top-level array results returned to the model. This is applied after the ResultFlow WhatsApp API responds.",
  },
};

function schema(properties, required = []) {
  return {
    type: "object",
    properties: {
      ...commonProperties,
      ...properties,
    },
    required,
    additionalProperties: false,
  };
}

function withInstance(properties, required = []) {
  return schema(
    {
      ...instanceProperty,
      ...properties,
    },
    required,
  );
}

const tools = [
  {
    name: "resultflow_status",
    description:
      "Check local MCP configuration for the ResultFlow WhatsApp API. Optionally verifies API access by fetching instances.",
    inputSchema: schema({
      checkApi: {
        type: "boolean",
        description:
          "When true, call /instance/fetchInstances to verify the pasted or environment API key.",
      },
      ...includeSensitiveProperty,
    }),
    handler: toolStatus,
  },
  {
    name: "resultflow_list_instances",
    description:
      "List ResultFlow WhatsApp API instances, or fetch one by instance name or instance ID.",
    inputSchema: schema({
      instanceName: {
        type: "string",
        description: "Optional instance name filter.",
      },
      instanceId: {
        type: "string",
        description: "Optional instance ID filter.",
      },
      ...includeSensitiveProperty,
      ...maxItemsProperty,
    }),
    handler: toolListInstances,
  },
  {
    name: "resultflow_create_instance",
    description:
      "Create a WhatsApp instance using the documented /instance/create endpoint.",
    inputSchema: schema(
      {
        instanceName: {
          type: "string",
          description: "New instance name.",
        },
        integration: {
          type: "string",
          enum: ["WHATSAPP-BAILEYS", "WHATSAPP-BUSINESS"],
          description:
            "WhatsApp engine. Defaults to WHATSAPP-BAILEYS when omitted.",
        },
        token: {
          type: "string",
          description:
            "Optional custom instance token. Leave blank to let ResultFlow generate one.",
        },
        qrcode: {
          type: "boolean",
          description: "Ask ResultFlow WhatsApp API to generate a QR code after creation.",
        },
        number: {
          type: "string",
          description: "Instance owner number with country code.",
        },
        rejectCall: { type: "boolean" },
        msgCall: { type: "string" },
        groupsIgnore: { type: "boolean" },
        alwaysOnline: { type: "boolean" },
        readMessages: { type: "boolean" },
        readStatus: { type: "boolean" },
        syncFullHistory: { type: "boolean" },
        webhook: {
          type: "object",
          description:
            "Optional creation-time webhook object using ResultFlow WhatsApp API field names.",
          additionalProperties: true,
        },
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
      ["instanceName"],
    ),
    handler: toolCreateInstance,
  },
  {
    name: "resultflow_connect_instance",
    description:
      "Generate connection QR/pairing data for a ResultFlow instance.",
    inputSchema: withInstance({
      number: {
        type: "string",
        description: "Optional phone number with country code for pairing.",
      },
      ...includeSensitiveProperty,
    }),
    handler: toolConnectInstance,
  },
  {
    name: "resultflow_get_connection_state",
    description: "Get the connection state for a ResultFlow instance.",
    inputSchema: withInstance({
      ...includeSensitiveProperty,
    }),
    handler: toolConnectionState,
  },
  {
    name: "resultflow_restart_instance",
    description: "Restart a ResultFlow instance.",
    inputSchema: withInstance({
      ...includeSensitiveProperty,
      ...dryRunProperty,
    }),
    handler: toolRestartInstance,
  },
  {
    name: "resultflow_logout_instance",
    description: "Log out a ResultFlow instance.",
    inputSchema: withInstance(
      {
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
    ),
    handler: toolLogoutInstance,
  },
  {
    name: "resultflow_delete_instance",
    description: "Delete a ResultFlow instance.",
    inputSchema: withInstance(
      {
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
    ),
    handler: toolDeleteInstance,
  },
  {
    name: "resultflow_set_presence",
    description: "Set a ResultFlow instance presence to available or unavailable.",
    inputSchema: withInstance(
      {
        presence: {
          type: "string",
          enum: ["available", "unavailable"],
        },
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
      ["presence"],
    ),
    handler: toolSetPresence,
  },
  {
    name: "resultflow_send_text",
    description:
      "Send a plain WhatsApp text message through /message/sendText/{instance}. For drafts, use dryRun: true.",
    inputSchema: withInstance(
      {
        number: {
          type: "string",
          description:
            "Recipient phone number with country code. If omitted, RESULTFLOW_API_DEFAULT_RECIPIENT is used when configured.",
        },
        text: {
          type: "string",
          description: "Message text to send.",
        },
        delay: { type: "integer", minimum: 0 },
        linkPreview: { type: "boolean" },
        mentionsEveryOne: { type: "boolean" },
        mentioned: {
          type: "array",
          items: { type: "string" },
        },
        quoted: {
          type: "object",
          additionalProperties: true,
        },
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
      ["text"],
    ),
    handler: toolSendText,
  },
  {
    name: "resultflow_send_media",
    description:
      "Send image, video, or document media through /message/sendMedia/{instance}. Media may be a URL or base64 string.",
    inputSchema: withInstance(
      {
        number: {
          type: "string",
          description:
            "Recipient phone number with country code. If omitted, RESULTFLOW_API_DEFAULT_RECIPIENT is used when configured.",
        },
        mediatype: {
          type: "string",
          enum: ["image", "video", "document"],
        },
        mimetype: {
          type: "string",
          description: "MIME type such as image/png or application/pdf.",
        },
        caption: { type: "string" },
        media: {
          type: "string",
          description: "Public URL or base64 media payload.",
        },
        fileName: { type: "string" },
        delay: { type: "integer", minimum: 0 },
        linkPreview: { type: "boolean" },
        mentionsEveryOne: { type: "boolean" },
        mentioned: {
          type: "array",
          items: { type: "string" },
        },
        quoted: {
          type: "object",
          additionalProperties: true,
        },
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
      ["mediatype", "mimetype", "caption", "media", "fileName"],
    ),
    handler: toolSendMedia,
  },
  {
    name: "resultflow_check_whatsapp_numbers",
    description:
      "Check whether phone numbers exist on WhatsApp using /chat/whatsappNumbers/{instance}.",
    inputSchema: withInstance(
      {
        numbers: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
          description: "Phone numbers with country code.",
        },
        ...includeSensitiveProperty,
        ...maxItemsProperty,
      },
      ["numbers"],
    ),
    handler: toolCheckWhatsAppNumbers,
  },
  {
    name: "resultflow_find_contacts",
    description:
      "Find all contacts or one contact by ID using /chat/findContacts/{instance}.",
    inputSchema: withInstance({
      contactId: {
        type: "string",
        description: "Optional contact ID or remote JID.",
      },
      where: {
        type: "object",
        description:
          "Optional ResultFlow WhatsApp API where object. contactId is converted to where.id when provided.",
        additionalProperties: true,
      },
      ...includeSensitiveProperty,
      ...maxItemsProperty,
    }),
    handler: toolFindContacts,
  },
  {
    name: "resultflow_find_chats",
    description: "Find all chats using /chat/findChats/{instance}.",
    inputSchema: withInstance({
      ...includeSensitiveProperty,
      ...maxItemsProperty,
    }),
    handler: toolFindChats,
  },
  {
    name: "resultflow_find_messages",
    description:
      "Find messages using /chat/findMessages/{instance}. Use remoteJid for a targeted chat when possible.",
    inputSchema: withInstance({
      remoteJid: {
        type: "string",
        description: "Optional contact or group remote JID.",
      },
      where: {
        type: "object",
        description:
          "Optional ResultFlow WhatsApp API where object. remoteJid is converted to where.key.remoteJid when provided.",
        additionalProperties: true,
      },
      ...includeSensitiveProperty,
      ...maxItemsProperty,
    }),
    handler: toolFindMessages,
  },
  {
    name: "resultflow_mark_messages_read",
    description:
      "Mark one or more messages as read using /chat/markMessageAsRead/{instance}.",
    inputSchema: withInstance(
      {
        readMessages: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              remoteJid: { type: "string" },
              fromMe: { type: "boolean" },
              id: { type: "string" },
            },
            required: ["remoteJid", "fromMe", "id"],
            additionalProperties: false,
          },
        },
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
      ["readMessages"],
    ),
    handler: toolMarkMessagesRead,
  },
  {
    name: "resultflow_archive_chat",
    description:
      "Archive or unarchive a chat. Requires the last message key fields required by ResultFlow WhatsApp API.",
    inputSchema: withInstance(
      {
        remoteJid: { type: "string" },
        messageId: { type: "string" },
        fromMe: { type: "boolean" },
        archive: { type: "boolean" },
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
      ["remoteJid", "messageId", "fromMe", "archive"],
    ),
    handler: toolArchiveChat,
  },
  {
    name: "resultflow_delete_message_for_everyone",
    description: "Delete a WhatsApp message for everyone.",
    inputSchema: withInstance(
      {
        id: { type: "string" },
        remoteJid: { type: "string" },
        fromMe: { type: "boolean" },
        participant: {
          type: "string",
          description: "Participant JID for group messages when needed.",
        },
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
      ["id", "remoteJid", "fromMe"],
    ),
    handler: toolDeleteMessageForEveryone,
  },
  {
    name: "resultflow_get_webhook",
    description: "Fetch webhook configuration for an instance.",
    inputSchema: withInstance({
      ...includeSensitiveProperty,
    }),
    handler: toolGetWebhook,
  },
  {
    name: "resultflow_set_webhook",
    description:
      "Set webhook configuration for an instance using documented ResultFlow WhatsApp API webhook fields.",
    inputSchema: withInstance(
      {
        enabled: { type: "boolean" },
        url: { type: "string" },
        webhookByEvents: { type: "boolean" },
        webhookBase64: { type: "boolean" },
        events: {
          type: "array",
          minItems: 1,
          items: {
            type: "string",
            enum: WEBHOOK_EVENTS,
          },
        },
        ...includeSensitiveProperty,
        ...dryRunProperty,
      },
      ["enabled", "url", "webhookByEvents", "webhookBase64", "events"],
    ),
    handler: toolSetWebhook,
  },
  {
    name: "resultflow_get_settings",
    description: "Fetch ResultFlow WhatsApp API instance settings.",
    inputSchema: withInstance({
      ...includeSensitiveProperty,
    }),
    handler: toolGetSettings,
  },
  {
    name: "resultflow_set_settings",
    description:
      "Set ResultFlow WhatsApp API instance settings. By default it fetches current settings and merges only provided fields before sending the full required payload.",
    inputSchema: withInstance({
      rejectCall: { type: "boolean" },
      msgCall: { type: "string" },
      groupsIgnore: { type: "boolean" },
      alwaysOnline: { type: "boolean" },
      readMessages: { type: "boolean" },
      readStatus: { type: "boolean" },
      syncFullHistory: { type: "boolean" },
      mergeWithCurrent: {
        type: "boolean",
        description:
          "When true, fetch current settings first and merge provided fields. Defaults to true.",
      },
      ...includeSensitiveProperty,
      ...dryRunProperty,
    }),
    handler: toolSetSettings,
  },
];

const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

function getConfig(args = {}, requireApiKey = true) {
  const baseUrl = normalizeBaseUrl(
    firstNonEmpty(args.baseUrl, process.env.RESULTFLOW_API_BASE_URL, DEFAULT_BASE_URL),
  );
  const apiKey = firstNonEmpty(args.apiKey, process.env.RESULTFLOW_API_KEY);
  const timeoutMs = parsePositiveInteger(
    process.env.RESULTFLOW_API_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  const dryRunDefault = parseBoolean(process.env.RESULTFLOW_API_DRY_RUN, false);

  if (requireApiKey && !apiKey) {
    throw userError(
      "Missing ResultFlow WhatsApp API key. Paste apiKey in the tool call or set RESULTFLOW_API_KEY for recurring automation.",
    );
  }

  return {
    baseUrl,
    apiKey,
    apiKeySource: args.apiKey ? "call" : apiKey ? "environment" : "missing",
    defaultInstance: firstNonEmpty(args.instance, process.env.RESULTFLOW_API_DEFAULT_INSTANCE),
    defaultRecipient: firstNonEmpty(args.number, process.env.RESULTFLOW_API_DEFAULT_RECIPIENT),
    timeoutMs,
    dryRunDefault,
  };
}

function normalizeBaseUrl(raw) {
  const trimmed = String(raw || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  const parsed = new URL(trimmed);
  if (parsed.pathname === "/manager" || parsed.pathname.endsWith("/manager")) {
    parsed.pathname = parsed.pathname.replace(/\/manager$/, "") || "/";
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function userError(message) {
  const error = new Error(message);
  error.isUserError = true;
  return error;
}

function requireInstance(args) {
  const instance = firstNonEmpty(args.instance, process.env.RESULTFLOW_API_DEFAULT_INSTANCE);
  if (!instance) {
    throw userError(
      "Missing instance name. Pass instance or set RESULTFLOW_API_DEFAULT_INSTANCE.",
    );
  }
  return instance;
}

function requireRecipient(args) {
  const number = firstNonEmpty(args.number, process.env.RESULTFLOW_API_DEFAULT_RECIPIENT);
  if (!number) {
    throw userError(
      "Missing recipient number. Pass number or set RESULTFLOW_API_DEFAULT_RECIPIENT for text-myself flows.",
    );
  }
  return normalizePhoneOrJid(number);
}

function normalizePhoneOrJid(value) {
  const trimmed = String(value || "").trim();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits || trimmed;
}

function encoded(value) {
  return encodeURIComponent(value);
}

function pickDefined(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function resolveDryRun(args, config) {
  return args.dryRun === undefined ? config.dryRunDefault : Boolean(args.dryRun);
}

async function callResultFlow(args, request) {
  const config = getConfig(args, true);
  const method = request.method.toUpperCase();
  const query = request.query || {};
  const url = new URL(`${config.baseUrl}${request.path}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  if (request.write && resolveDryRun(args, config)) {
    return {
      dryRun: true,
      wouldRequest: {
        method,
        url: url.toString(),
        body: request.body || null,
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        apikey: config.apiKey,
        "content-type": "application/json",
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: controller.signal,
    });
    const text = await response.text();
    const data = parseJsonOrText(text);
    const payload = {
      ok: response.ok,
      status: response.status,
      method,
      path: `${url.pathname}${url.search}`,
      data,
    };

    if (!response.ok) {
      const error = userError(`ResultFlow WhatsApp API returned HTTP ${response.status}.`);
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw userError(`ResultFlow WhatsApp API request timed out after ${config.timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonOrText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function finish(data, args = {}) {
  const limited = applyMaxItems(data, args.maxItems);
  return args.includeSensitive === true ? limited : redactSensitive(limited);
}

function applyMaxItems(data, maxItems) {
  if (!maxItems) return data;
  const limit = Math.max(1, Math.min(500, Number(maxItems)));
  if (Array.isArray(data)) {
    return {
      truncated: data.length > limit,
      totalItems: data.length,
      items: data.slice(0, limit),
    };
  }
  if (!data || typeof data !== "object") return data;

  const clone = Array.isArray(data) ? [] : { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      clone[key] = {
        truncated: value.length > limit,
        totalItems: value.length,
        items: value.slice(0, limit),
      };
    }
  }
  return clone;
}

function redactSensitive(value, parentKey = "") {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, parentKey));
  }
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const keyName = String(key).toLowerCase();
    if (
      keyName.includes("apikey") ||
      keyName.includes("api_key") ||
      keyName === "token" ||
      keyName.includes("access_token") ||
      keyName.includes("authorization") ||
      keyName.includes("password") ||
      keyName.includes("secret")
    ) {
      result[key] = "[redacted]";
    } else {
      result[key] = redactSensitive(item, key);
    }
  }
  return result;
}

async function toolStatus(args) {
  const config = getConfig(args, false);
  const result = {
    server: SERVER_NAME,
    version: SERVER_VERSION,
    baseUrl: config.baseUrl,
    managerUrl: `${config.baseUrl}/manager`,
    hasApiKey: Boolean(config.apiKey),
    apiKeySource: config.apiKeySource,
    defaultInstanceConfigured: Boolean(process.env.RESULTFLOW_API_DEFAULT_INSTANCE),
    defaultRecipientConfigured: Boolean(process.env.RESULTFLOW_API_DEFAULT_RECIPIENT),
    dryRunDefault: config.dryRunDefault,
    node: process.version,
  };

  if (args.checkApi === true) {
    result.apiCheck = await callResultFlow(args, {
      method: "GET",
      path: "/instance/fetchInstances",
    });
  }

  return finish(result, args);
}

async function toolListInstances(args) {
  return finish(
    await callResultFlow(args, {
      method: "GET",
      path: "/instance/fetchInstances",
      query: {
        instanceName: args.instanceName,
        instanceId: args.instanceId,
      },
    }),
    args,
  );
}

async function toolCreateInstance(args) {
  const body = {
    ...pickDefined(args, [
      "instanceName",
      "token",
      "qrcode",
      "number",
      "rejectCall",
      "msgCall",
      "groupsIgnore",
      "alwaysOnline",
      "readMessages",
      "readStatus",
      "syncFullHistory",
      "webhook",
    ]),
    integration: args.integration || "WHATSAPP-BAILEYS",
  };
  if (body.number) body.number = normalizePhoneOrJid(body.number);

  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: "/instance/create",
      body,
      write: true,
    }),
    args,
  );
}

async function toolConnectInstance(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "GET",
      path: `/instance/connect/${encoded(instance)}`,
      query: { number: args.number ? normalizePhoneOrJid(args.number) : undefined },
    }),
    args,
  );
}

async function toolConnectionState(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "GET",
      path: `/instance/connectionState/${encoded(instance)}`,
    }),
    args,
  );
}

async function toolRestartInstance(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "PUT",
      path: `/instance/restart/${encoded(instance)}`,
      write: true,
    }),
    args,
  );
}

async function toolLogoutInstance(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "DELETE",
      path: `/instance/logout/${encoded(instance)}`,
      write: true,
    }),
    args,
  );
}

async function toolDeleteInstance(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "DELETE",
      path: `/instance/delete/${encoded(instance)}`,
      write: true,
    }),
    args,
  );
}

async function toolSetPresence(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/instance/setPresence/${encoded(instance)}`,
      body: { presence: args.presence },
      write: true,
    }),
    args,
  );
}

async function toolSendText(args) {
  const instance = requireInstance(args);
  const body = {
    ...pickDefined(args, [
      "text",
      "delay",
      "linkPreview",
      "mentionsEveryOne",
      "mentioned",
      "quoted",
    ]),
    number: requireRecipient(args),
  };

  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/message/sendText/${encoded(instance)}`,
      body,
      write: true,
    }),
    args,
  );
}

async function toolSendMedia(args) {
  const instance = requireInstance(args);
  const body = {
    ...pickDefined(args, [
      "mediatype",
      "mimetype",
      "caption",
      "media",
      "fileName",
      "delay",
      "linkPreview",
      "mentionsEveryOne",
      "mentioned",
      "quoted",
    ]),
    number: requireRecipient(args),
  };

  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/message/sendMedia/${encoded(instance)}`,
      body,
      write: true,
    }),
    args,
  );
}

async function toolCheckWhatsAppNumbers(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/chat/whatsappNumbers/${encoded(instance)}`,
      body: { numbers: args.numbers.map(normalizePhoneOrJid) },
    }),
    args,
  );
}

async function toolFindContacts(args) {
  const instance = requireInstance(args);
  const where = args.contactId ? { id: args.contactId } : args.where || {};
  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/chat/findContacts/${encoded(instance)}`,
      body: { where },
    }),
    args,
  );
}

async function toolFindChats(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/chat/findChats/${encoded(instance)}`,
    }),
    args,
  );
}

async function toolFindMessages(args) {
  const instance = requireInstance(args);
  const where = args.remoteJid
    ? { key: { remoteJid: args.remoteJid } }
    : args.where || {};
  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/chat/findMessages/${encoded(instance)}`,
      body: { where },
    }),
    args,
  );
}

async function toolMarkMessagesRead(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/chat/markMessageAsRead/${encoded(instance)}`,
      body: { readMessages: args.readMessages },
      write: true,
    }),
    args,
  );
}

async function toolArchiveChat(args) {
  const instance = requireInstance(args);
  const body = {
    lastMessage: {
      key: {
        remoteJid: args.remoteJid,
        fromMe: args.fromMe,
        id: args.messageId,
      },
    },
    archive: args.archive,
    chat: args.remoteJid,
  };
  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/chat/archiveChat/${encoded(instance)}`,
      body,
      write: true,
    }),
    args,
  );
}

async function toolDeleteMessageForEveryone(args) {
  const instance = requireInstance(args);
  const body = pickDefined(args, ["id", "remoteJid", "fromMe", "participant"]);
  return finish(
    await callResultFlow(args, {
      method: "DELETE",
      path: `/chat/deleteMessageForEveryone/${encoded(instance)}`,
      body,
      write: true,
    }),
    args,
  );
}

async function toolGetWebhook(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "GET",
      path: `/webhook/find/${encoded(instance)}`,
    }),
    args,
  );
}

async function toolSetWebhook(args) {
  const instance = requireInstance(args);
  const webhook = pickDefined(args, [
    "enabled",
    "url",
    "webhookByEvents",
    "webhookBase64",
    "events",
  ]);
  const body = { webhook };
  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/webhook/set/${encoded(instance)}`,
      body,
      write: true,
    }),
    args,
  );
}

async function toolGetSettings(args) {
  const instance = requireInstance(args);
  return finish(
    await callResultFlow(args, {
      method: "GET",
      path: `/settings/find/${encoded(instance)}`,
    }),
    args,
  );
}

async function toolSetSettings(args) {
  const instance = requireInstance(args);
  const provided = pickDefined(args, [
    "rejectCall",
    "msgCall",
    "groupsIgnore",
    "alwaysOnline",
    "readMessages",
    "readStatus",
    "syncFullHistory",
  ]);
  if (Object.keys(provided).length === 0) {
    throw userError("Provide at least one settings field to change.");
  }

  let body = provided;
  if (args.mergeWithCurrent !== false && !resolveDryRun(args, getConfig(args, true))) {
    const current = await callResultFlow(args, {
      method: "GET",
      path: `/settings/find/${encoded(instance)}`,
    });
    body = {
      ...settingsToCamel(current.data),
      ...provided,
    };
  }

  const required = [
    "rejectCall",
    "msgCall",
    "groupsIgnore",
    "alwaysOnline",
    "readMessages",
    "readStatus",
    "syncFullHistory",
  ];
  const missing = required.filter((key) => body[key] === undefined);
  if (missing.length > 0) {
    throw userError(
      `Missing required setting fields: ${missing.join(", ")}. Call resultflow_get_settings first or use mergeWithCurrent: true.`,
    );
  }

  return finish(
    await callResultFlow(args, {
      method: "POST",
      path: `/settings/set/${encoded(instance)}`,
      body,
      write: true,
    }),
    args,
  );
}

function settingsToCamel(data) {
  const source = data?.settings?.settings || data?.settings || data || {};
  return {
    rejectCall: source.rejectCall ?? source.reject_call,
    msgCall: source.msgCall ?? source.msg_call ?? "",
    groupsIgnore: source.groupsIgnore ?? source.groups_ignore,
    alwaysOnline: source.alwaysOnline ?? source.always_online,
    readMessages: source.readMessages ?? source.read_messages,
    readStatus: source.readStatus ?? source.read_status,
    syncFullHistory: source.syncFullHistory ?? source.sync_full_history,
  };
}

function serializeToolResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function serializeToolError(error) {
  const payload = {
    error: error.message || "Unknown MCP tool error",
  };
  if (error.payload) payload.details = redactSensitive(error.payload);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

async function handleRequest(message) {
  if (!message || typeof message !== "object") return;

  if (message.method === "notifications/initialized") return;

  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      },
    });
    return;
  }

  if (message.method === "ping") {
    send({ jsonrpc: "2.0", id: message.id, result: {} });
    return;
  }

  if (message.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: tools.map(({ handler, ...tool }) => tool),
      },
    });
    return;
  }

  if (message.method === "tools/call") {
    const tool = toolMap.get(message.params?.name);
    if (!tool) {
      sendError(message.id, -32602, `Unknown tool: ${message.params?.name}`);
      return;
    }

    try {
      const args = message.params?.arguments || {};
      const result = await tool.handler(args);
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: serializeToolResult(result),
      });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: serializeToolError(error),
      });
    }
    return;
  }

  if (message.id !== undefined) {
    sendError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  });
}

let buffer = "";
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
    } catch (error) {
      sendError(null, -32700, "Parse error");
      continue;
    }

    handleRequest(message).catch((error) => {
      console.error(error);
      if (message.id !== undefined) {
        sendError(message.id, -32603, error.message || "Internal error");
      }
    });
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
