import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Telegram Bot API helpers (server-side only).
 * Token resolution order:
 *   1. TELEGRAM_BOT_TOKEN env var
 *   2. `botToken` row in the settings table (set via the admin panel)
 * A short in-memory cache avoids a DB hit on every call.
 */

let cachedToken: string | null = null;
let cachedAt = 0;
const TOKEN_TTL_MS = 30_000;

export async function getBotToken(): Promise<string | null> {
  const env = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (env && env.length > 10) return env;

  const now = Date.now();
  if (cachedToken && now - cachedAt < TOKEN_TTL_MS) return cachedToken;

  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, "botToken"))
      .limit(1);
    const t = row?.value?.trim() ?? "";
    cachedToken = t.length > 10 ? t : null;
    cachedAt = now;
    return cachedToken;
  } catch {
    return null;
  }
}

/** Invalidate the token cache (call after the admin updates the token) */
export function invalidateBotTokenCache() {
  cachedToken = null;
  cachedAt = 0;
}

async function tgCall<T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T | null> {
  const token = await getBotToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { ok: boolean; result?: T };
    return json.ok ? (json.result as T) : null;
  } catch {
    return null;
  }
}

export function sendMessage(
  chatId: number | string,
  text: string,
  extra: Record<string, unknown> = {}
) {
  return tgCall<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

/** Send a photo from a base64 data buffer (multipart upload) */
export async function sendPhotoBase64(
  chatId: number | string,
  base64: string,
  mime: string,
  caption: string,
  extra: Record<string, unknown> = {}
): Promise<boolean> {
  const token = await getBotToken();
  if (!token) return false;
  try {
    const buf = Buffer.from(base64, "base64");
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    for (const [k, v] of Object.entries(extra)) {
      form.append(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    const ext = mime.includes("png") ? "png" : "jpg";
    form.append(
      "photo",
      new Blob([new Uint8Array(buf)], { type: mime }),
      `receipt.${ext}`
    );
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as { ok: boolean };
    return json.ok;
  } catch {
    return false;
  }
}

/** Check if a user is a member of the required channel */
export async function isChannelMember(
  channel: string,
  userId: number
): Promise<boolean | null> {
  if (!channel || !(await getBotToken())) return null; // cannot check → allow
  const chatId = channel.startsWith("@") ? channel : `@${channel}`;
  const result = await tgCall<{ status: string }>("getChatMember", {
    chat_id: chatId,
    user_id: userId,
  });
  if (!result) return null; // bot not admin in channel / bad channel → don't block
  return ["creator", "administrator", "member"].includes(result.status);
}

export async function setWebhook(url: string): Promise<boolean> {
  const r = await tgCall<boolean>("setWebhook", {
    url,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  return r === true;
}

export async function getBotInfo() {
  return tgCall<{ id: number; username: string; first_name: string }>(
    "getMe",
    {}
  );
}

export function answerCallbackQuery(id: string, text: string) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: id,
    text,
    show_alert: false,
  });
}

export function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  extra: Record<string, unknown> = {}
) {
  return tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

export function editMessageCaption(
  chatId: number,
  messageId: number,
  caption: string,
  extra: Record<string, unknown> = {}
) {
  return tgCall("editMessageCaption", {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: "HTML",
    ...extra,
  });
}

/** Persist the mini-app public URL so /start can open it */
export async function saveAppUrl(url: string) {
  await db
    .insert(settings)
    .values({ key: "appUrl", value: url })
    .onConflictDoUpdate({ target: settings.key, set: { value: url } });
}

export async function getAppUrl(): Promise<string> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "appUrl"))
    .limit(1);
  return row?.value ?? "";
}
