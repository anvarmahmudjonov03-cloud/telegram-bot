import { db } from "@/db";
import { sql } from "drizzle-orm";
import { pollerStatus } from "@/lib/poller";
import { ensureWebhook } from "@/lib/autohook";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    // Healthchecks double as a watchdog: keep the webhook bound to this
    // deployment (webhook-first transport; poller is only a boot fallback).
    ensureWebhook();
    return Response.json({ ok: true, bot: pollerStatus() });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
