import crypto from "crypto";
import { db } from "@/db";
import { users, admins, settings, activityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import type { StoreSettings } from "@/lib/types";

/** Hardcoded fallback admins + env-provided list */
const ADMIN_IDS: number[] = [
  7367129888,
  ...(process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n)),
];

export interface AuthUser {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
}

/** Verify Telegram WebApp initData signature (when BOT_TOKEN is configured) */
function verifyInitData(initData: string, botToken: string): boolean {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;
    params.delete("hash");
    const dataCheck = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();
    const computed = crypto
      .createHmac("sha256", secret)
      .update(dataCheck)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(hash, "hex")
    );
  } catch {
    return false;
  }
}

/** Extract and validate the requesting Telegram user from headers */
export function getAuthUser(req: NextRequest): AuthUser | null {
  const initData = req.headers.get("x-telegram-init-data");
  if (initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken && !verifyInitData(initData, botToken)) return null;
    try {
      const params = new URLSearchParams(initData);
      const userJson = params.get("user");
      if (!userJson) return null;
      const u = JSON.parse(userJson) as {
        id: number;
        username?: string;
        first_name?: string;
        last_name?: string;
        photo_url?: string;
      };
      if (typeof u.id !== "number") return null;
      return {
        telegramId: u.id,
        username: u.username ?? null,
        firstName: u.first_name ?? null,
        lastName: u.last_name ?? null,
        photoUrl: u.photo_url ?? null,
      };
    } catch {
      return null;
    }
  }
  // Demo mode (browser preview outside Telegram)
  const demo = req.headers.get("x-demo-user");
  if (demo) {
    try {
      const u = JSON.parse(demo) as {
        id: number;
        username?: string;
        first_name?: string;
        last_name?: string;
      };
      if (typeof u.id !== "number") return null;
      return {
        telegramId: u.id,
        username: u.username ?? null,
        firstName: u.first_name ?? null,
        lastName: u.last_name ?? null,
        photoUrl: null,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** Upsert the user row and touch last activity */
export async function upsertUser(auth: AuthUser) {
  const [row] = await db
    .insert(users)
    .values({
      telegramId: auth.telegramId,
      username: auth.username,
      firstName: auth.firstName,
      lastName: auth.lastName,
      photoUrl: auth.photoUrl,
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        username: auth.username,
        firstName: auth.firstName,
        lastName: auth.lastName,
        photoUrl: auth.photoUrl,
        lastActivity: new Date(),
      },
    })
    .returning();
  return row;
}

/** Server-side admin check: env list + admins table */
export async function isAdmin(telegramId: number): Promise<boolean> {
  if (ADMIN_IDS.includes(telegramId)) return true;
  const rows = await db
    .select()
    .from(admins)
    .where(eq(admins.telegramId, telegramId))
    .limit(1);
  return rows.length > 0;
}

/** Guard for admin routes — returns the auth user or null */
export async function requireAdmin(req: NextRequest): Promise<AuthUser | null> {
  const auth = getAuthUser(req);
  if (!auth) return null;
  return (await isAdmin(auth.telegramId)) ? auth : null;
}

/* ---------------- Settings ---------------- */

const SETTING_DEFAULTS: Record<string, string> = {
  storeName: "Premium Store",
  supportUsername: "@premium_support",
  telegramChannel: "@premium_store_channel",
  currency: "USD",
  maintenanceMode: "false",
  announcement: "",
  announcementRu: "",
  announcementEn: "",
  requiredChannel: "",
  visaCard: "",
  visaHolder: "",
  humoCard: "",
  humoHolder: "",
  botUsername: "",
};

export async function getStoreSettings(): Promise<StoreSettings> {
  const rows = await db.select().from(settings);
  const map: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return {
    storeName: map.storeName,
    supportUsername: map.supportUsername,
    telegramChannel: map.telegramChannel,
    currency: map.currency,
    maintenanceMode: map.maintenanceMode === "true",
    announcement: map.announcement,
    announcementRu: map.announcementRu,
    announcementEn: map.announcementEn,
    requiredChannel: map.requiredChannel,
    visaCard: map.visaCard,
    visaHolder: map.visaHolder,
    humoCard: map.humoCard,
    humoHolder: map.humoHolder,
    botUsername: map.botUsername,
  };
}

/** Export the list of admin telegram IDs (env + DB) for bot notifications */
export async function getAllAdminIds(): Promise<number[]> {
  const rows = await db.select().from(admins);
  return [...new Set([...ADMIN_IDS, ...rows.map((r) => r.telegramId)])];
}

export async function logActivity(
  actorTelegramId: number | null,
  action: string,
  details: string
) {
  await db.insert(activityLogs).values({ actorTelegramId, action, details });
}

/* ---------------- Rate limiting (in-memory sliding window) ---------------- */

const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

/** Basic input sanitizer */
export function sanitize(input: unknown, maxLen = 500): string {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>/g, "").trim().slice(0, maxLen);
}
