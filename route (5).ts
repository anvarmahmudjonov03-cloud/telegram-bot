import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, orders } from "@/db/schema";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { requireAdmin, rateLimit, sanitize } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

/** User directory with order counts and total spend — admin only */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rateLimit(`admin-users:${admin.telegramId}`, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const q = sanitize(req.nextUrl.searchParams.get("q"), 100);
  const where = q
    ? or(
        ilike(users.username, `%${q}%`),
        ilike(users.firstName, `%${q}%`),
        sql`${users.telegramId}::text ilike ${"%" + q + "%"}`
      )
    : undefined;

  const rows = await db
    .select({
      id: users.id,
      telegramId: users.telegramId,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      photoUrl: users.photoUrl,
      lastActivity: users.lastActivity,
      createdAt: users.createdAt,
      ordersCount: sql<number>`count(${orders.id})::int`,
      totalSpent: sql<string>`coalesce(sum(${orders.price}) filter (where ${orders.status} in ('paid','processing','completed')), 0)::text`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(where)
    .groupBy(users.id)
    .orderBy(desc(users.lastActivity))
    .limit(300);

  return NextResponse.json({ users: rows });
}
