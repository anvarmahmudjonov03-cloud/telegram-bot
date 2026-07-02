import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, rateLimit, logActivity } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const ALLOWED_KEYS = [
  "storeLogo",
  "visaLogo",
  "humoLogo",
  "favicon",
  "navHome",
  "navOrders",
  "navAdmin",
  "catStars",
  "catPremium",
  "catGift",
];
const ALLOWED_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];
/** ~2MB binary limit (base64 inflated) */
const MAX_B64 = 2_800_000;

/** Upload a brand asset (logo/icon) — admin only */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rateLimit(`upload:${admin.telegramId}`, 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as {
    key?: string;
    data?: string;
    mime?: string;
  } | null;

  if (!body?.key || !ALLOWED_KEYS.includes(body.key)) {
    return NextResponse.json({ error: "Invalid asset key" }, { status: 400 });
  }
  if (!body.mime || !ALLOWED_MIMES.includes(body.mime)) {
    return NextResponse.json(
      { error: "Only PNG, JPG, WEBP or SVG images are allowed" },
      { status: 400 }
    );
  }
  if (
    typeof body.data !== "string" ||
    body.data.length < 50 ||
    body.data.length > MAX_B64 ||
    !/^[A-Za-z0-9+/=]+$/.test(body.data)
  ) {
    return NextResponse.json(
      { error: "Invalid image data (max 2MB)" },
      { status: 400 }
    );
  }

  const value = JSON.stringify({ data: body.data, mime: body.mime });
  await db
    .insert(settings)
    .values({ key: `asset:${body.key}`, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });

  await logActivity(admin.telegramId, "asset.uploaded", `Asset "${body.key}" updated`);
  return NextResponse.json({ ok: true, url: `/api/assets/${body.key}` });
}

/** Reset an asset back to the bundled default — admin only */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "Invalid asset key" }, { status: 400 });
  }
  await db.delete(settings).where(eq(settings.key, `asset:${key}`));
  await logActivity(admin.telegramId, "asset.reset", `Asset "${key}" reset to default`);
  return NextResponse.json({ ok: true });
}
