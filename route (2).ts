import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import {
  requireAdmin,
  getStoreSettings,
  rateLimit,
  sanitize,
  logActivity,
} from "@/lib/serverAuth";
import { getBotToken, invalidateBotTokenCache } from "@/lib/bot";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = [
  "storeName",
  "supportUsername",
  "telegramChannel",
  "currency",
  "maintenanceMode",
  "announcement",
  "announcementRu",
  "announcementEn",
  "requiredChannel",
  "visaCard",
  "visaHolder",
  "humoCard",
  "humoHolder",
];

/** Read store settings — admin only */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const token = await getBotToken();
  return NextResponse.json({
    settings: await getStoreSettings(),
    botTokenSet: !!token,
    botTokenMasked: token
      ? `${token.slice(0, token.indexOf(":") + 1)}••••${token.slice(-4)}`
      : "",
  });
}

/** Update store settings — admin only */
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rateLimit(`settings:${admin.telegramId}`, 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  for (const key of ALLOWED_KEYS) {
    if (body[key] === undefined) continue;
    const value =
      key === "maintenanceMode"
        ? String(body[key] === true || body[key] === "true")
        : sanitize(String(body[key]), 300);
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }
  // Bot token: stored separately, never echoed back in full.
  // Ignore masked round-trips (values containing bullet chars).
  if (typeof body.botToken === "string" && !body.botToken.includes("•")) {
    const raw = body.botToken.trim();
    if (raw === "" || /^\d+:[\w-]{30,}$/.test(raw)) {
      if (raw === "") {
        await db.delete(settings).where(eq(settings.key, "botToken"));
      } else {
        await db
          .insert(settings)
          .values({ key: "botToken", value: raw })
          .onConflictDoUpdate({ target: settings.key, set: { value: raw } });
      }
      invalidateBotTokenCache();
      await logActivity(
        admin.telegramId,
        "bot.token",
        raw === "" ? "Bot token removed" : "Bot token updated"
      );
    } else {
      return NextResponse.json(
        { error: "Bot token formati noto'g'ri (123456:ABC-... ko'rinishida bo'lishi kerak)" },
        { status: 400 }
      );
    }
  }

  await logActivity(admin.telegramId, "settings.updated", "Store settings updated");
  const token = await getBotToken();
  return NextResponse.json({
    settings: await getStoreSettings(),
    botTokenSet: !!token,
    botTokenMasked: token
      ? `${token.slice(0, token.indexOf(":") + 1)}••••${token.slice(-4)}`
      : "",
  });
}
