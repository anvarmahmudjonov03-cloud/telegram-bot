import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { packages } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { getAuthUser, rateLimit } from "@/lib/serverAuth";
import { ensureWebhook } from "@/lib/autohook";

export const dynamic = "force-dynamic";

/** Public catalog: only active packages, optionally filtered by type */
export async function GET(req: NextRequest) {
  ensureWebhook(req);
  const auth = getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`pkgs:${auth.telegramId}`, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const type = req.nextUrl.searchParams.get("type");
  const where =
    type && ["premium", "stars", "gift"].includes(type)
      ? and(eq(packages.active, true), eq(packages.type, type))
      : eq(packages.active, true);
  const rows = await db
    .select()
    .from(packages)
    .where(where)
    .orderBy(asc(packages.sortOrder), asc(packages.id));
  return NextResponse.json({ packages: rows });
}
