import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, isAdmin } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

/** Serve a payment receipt image — only for admins or the order owner */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const orderId = parseInt(id, 10);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [row] = await db
    .select({ order: orders, ownerTgId: users.telegramId })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row?.order.receiptData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admin = await isAdmin(auth.telegramId);
  if (!admin && row.ownerTgId !== auth.telegramId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const buf = Buffer.from(row.order.receiptData, "base64");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": row.order.receiptMime ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
