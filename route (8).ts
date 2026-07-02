import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { requireAdmin, logActivity } from "@/lib/serverAuth";
import { getBotInfo, saveAppUrl, getBotToken } from "@/lib/bot";
import { startPoller } from "@/lib/poller";

export const dynamic = "force-dynamic";

/**
 * Bot "connect" endpoint. Admin only.
 * With long-polling as the transport there is nothing fragile to register:
 * we verify the token (getMe), store the current app URL for the /start
 * button, and make sure the polling loop is running.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await getBotToken())) {
    return NextResponse.json(
      {
        error:
          "Bot token sozlanmagan. Settings bo'limida Bot token maydonini to'ldiring.",
      },
      { status: 400 }
    );
  }

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) {
    return NextResponse.json({ error: "Cannot detect host" }, { status: 400 });
  }
  const origin = `${proto}://${host}`;

  const info = await getBotInfo();
  if (!info) {
    return NextResponse.json(
      { error: "Token noto'g'ri — Telegram getMe muvaffaqiyatsiz." },
      { status: 400 }
    );
  }

  await saveAppUrl(origin);
  // Long-polling is the permanent transport (URL-rotation-proof).
  // The poller deletes any stale webhook itself.
  startPoller();

  await db
    .insert(settings)
    .values({ key: "botUsername", value: `@${info.username}` })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: `@${info.username}` },
    });

  await logActivity(
    admin.telegramId,
    "bot.setup",
    `Bot @${info.username} connected (long-polling), app URL ${origin}`
  );

  return NextResponse.json({
    ok: true,
    bot: info,
    mode: "long-polling",
    appUrl: origin,
  });
}
