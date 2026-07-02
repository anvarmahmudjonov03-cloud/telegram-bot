import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users, activityLogs } from "@/db/schema";
import { sql, desc } from "drizzle-orm";
import { requireAdmin, rateLimit } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

/** Dashboard analytics (admin only) */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!rateLimit(`stats:${admin.telegramId}`, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const [counts] = await db
    .select({
      totalOrders: sql<number>`count(*)::int`,
      pendingOrders: sql<number>`count(*) filter (where ${orders.status} in ('pending','waiting_payment'))::int`,
      completedOrders: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
      revenue: sql<string>`coalesce(sum(${orders.price}) filter (where ${orders.status} in ('paid','processing','completed')), 0)::text`,
      todayOrders: sql<number>`count(*) filter (where ${orders.createdAt} >= date_trunc('day', now()))::int`,
    })
    .from(orders);

  const [{ usersCount }] = await db
    .select({ usersCount: sql<number>`count(*)::int` })
    .from(users);

  const salesByDay = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'Mon DD')`,
      orders: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.status} in ('paid','processing','completed')), 0)::float`,
    })
    .from(orders)
    .where(sql`${orders.createdAt} >= now() - interval '14 days'`)
    .groupBy(sql`date_trunc('day', ${orders.createdAt})`)
    .orderBy(sql`date_trunc('day', ${orders.createdAt})`);

  const statusBreakdown = await db
    .select({
      status: orders.status,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .groupBy(orders.status);

  const recentActivity = await db
    .select()
    .from(activityLogs)
    .orderBy(desc(activityLogs.createdAt))
    .limit(12);

  return NextResponse.json({
    ...counts,
    usersCount,
    salesByDay,
    statusBreakdown,
    recentActivity,
  });
}
