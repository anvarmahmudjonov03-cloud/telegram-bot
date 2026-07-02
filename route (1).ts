import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { packages } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import {
  requireAdmin,
  rateLimit,
  sanitize,
  logActivity,
} from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

const TYPES = ["premium", "stars", "gift"];

function parsePkgBody(body: Record<string, unknown>) {
  const price = parseFloat(String(body.price));
  return {
    title: sanitize(body.title, 120),
    description: sanitize(body.description, 500),
    price: Number.isFinite(price) && price >= 0 ? price.toFixed(2) : null,
    starsAmount:
      body.starsAmount != null && String(body.starsAmount) !== ""
        ? Math.max(0, parseInt(String(body.starsAmount), 10) || 0)
        : null,
    duration: sanitize(body.duration, 60) || null,
    emoji: sanitize(body.emoji, 8) || "⭐",
    imageUrl: sanitize(body.imageUrl, 500) || null,
    active: body.active !== false,
    available: body.available !== false,
    sortOrder: Number.isFinite(Number(body.sortOrder))
      ? Number(body.sortOrder)
      : 0,
  };
}

/** List ALL packages (including hidden) — admin only */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(packages)
    .orderBy(asc(packages.type), asc(packages.sortOrder), asc(packages.id));
  return NextResponse.json({ packages: rows });
}

/** Create a package */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rateLimit(`pkg-write:${admin.telegramId}`, 60)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const type = String(body.type ?? "");
  if (!TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  const data = parsePkgBody(body);
  if (!data.title || data.price === null) {
    return NextResponse.json(
      { error: "Title and valid price are required" },
      { status: 400 }
    );
  }
  const [row] = await db
    .insert(packages)
    .values({ ...data, price: data.price, type })
    .returning();
  await logActivity(
    admin.telegramId,
    "package.created",
    `${type} package "${data.title}" created`
  );
  return NextResponse.json({ package: row }, { status: 201 });
}

/** Update a package */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const id = Number(body?.id);
  if (!body || !Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const data = parsePkgBody(body);
  if (!data.title || data.price === null) {
    return NextResponse.json(
      { error: "Title and valid price are required" },
      { status: 400 }
    );
  }
  const [row] = await db
    .update(packages)
    .set({ ...data, price: data.price })
    .where(eq(packages.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await logActivity(
    admin.telegramId,
    "package.updated",
    `Package #${id} "${data.title}" updated`
  );
  return NextResponse.json({ package: row });
}

/** Delete a package */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await db.delete(packages).where(eq(packages.id, id));
  await logActivity(admin.telegramId, "package.deleted", `Package #${id} deleted`);
  return NextResponse.json({ ok: true });
}
