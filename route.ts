import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users, notifications } from "@/db/schema";
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  requireAdmin,
  rateLimit,
  sanitize,
  logActivity,
} from "@/lib/serverAuth";
import { ALL_STATUSES, STATUS_META, type OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/** List/search/filter/export orders — admin only */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!rateLimit(`admin-orders:${admin.telegramId}`, 180)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const q = sanitize(req.nextUrl.searchParams.get("q"), 100);
  const status = req.nextUrl.searchParams.get("status");
  const exportCsv = req.nextUrl.searchParams.get("export") === "csv";

  const conds: SQL[] = [];
  if (status && (ALL_STATUSES as string[]).includes(status)) {
    conds.push(eq(orders.status, status));
  }
  if (q) {
    const cond = or(
      ilike(orders.packageTitle, `%${q}%`),
      ilike(orders.telegramUsername, `%${q}%`),
      sql`${orders.id}::text ilike ${"%" + q + "%"}`,
      sql`${orders.telegramId}::text ilike ${"%" + q + "%"}`
    );
    if (cond) conds.push(cond);
  }

  const rows = await db
    .select({
      order: orders,
      userName: users.firstName,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(500);

  const list = rows.map((r) => {
    const { receiptData, ...rest } = r.order;
    return { ...rest, hasReceipt: !!receiptData, userName: r.userName };
  });

  if (exportCsv) {
    const header =
      "id,status,package,type,price,username,telegram_id,comment,admin_note,created_at";
    const csv = [
      header,
      ...list.map((o) =>
        [
          o.id,
          o.status,
          `"${o.packageTitle.replace(/"/g, '""')}"`,
          o.packageType,
          o.price,
          o.telegramUsername,
          o.telegramId,
          `"${(o.comment ?? "").replace(/"/g, '""')}"`,
          `"${(o.adminNote ?? "").replace(/"/g, '""')}"`,
          o.createdAt.toISOString(),
        ].join(",")
      ),
    ].join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=orders.csv",
      },
    });
  }

  return NextResponse.json({ orders: list });
}

/** Update status / note for one or many orders (bulk actions) */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as {
    ids?: number[];
    status?: string;
    adminNote?: string;
  } | null;
  const ids = (body?.ids ?? []).map(Number).filter((n) => Number.isInteger(n));
  if (!body || ids.length === 0) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const targets = await db.select().from(orders).where(inArray(orders.id, ids));

  for (const o of targets) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status && (ALL_STATUSES as string[]).includes(body.status)) {
      const history = JSON.parse(o.statusHistory || "[]") as unknown[];
      history.push({
        status: body.status,
        at: new Date().toISOString(),
        by: `admin:${admin.telegramId}`,
      });
      set.status = body.status;
      set.statusHistory = JSON.stringify(history);
    }
    if (body.adminNote !== undefined) {
      set.adminNote = sanitize(body.adminNote, 500) || null;
    }
    await db.update(orders).set(set).where(eq(orders.id, o.id));

    if (set.status && set.status !== o.status) {
      const meta = STATUS_META[set.status as OrderStatus];
      await db.insert(notifications).values({
        userId: o.userId,
        type:
          set.status === "completed"
            ? "success"
            : set.status === "rejected" || set.status === "cancelled"
              ? "error"
              : "info",
        title: `Order #${o.id} ${meta.label.toLowerCase()}`,
        message: `Your order "${o.packageTitle}" status changed to ${meta.label}.`,
      });
    }
  }

  await logActivity(
    admin.telegramId,
    "order.updated",
    `Orders [${ids.join(", ")}] → ${body.status ?? "note updated"}`
  );
  return NextResponse.json({ ok: true, updated: targets.length });
}

/** Delete orders (bulk) */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
  if (ids.length === 0) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  }
  await db.delete(orders).where(inArray(orders.id, ids));
  await logActivity(
    admin.telegramId,
    "order.deleted",
    `Orders [${ids.join(", ")}] deleted`
  );
  return NextResponse.json({ ok: true });
}
