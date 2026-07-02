import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { orders, packages, users, notifications } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  getAuthUser,
  upsertUser,
  rateLimit,
  sanitize,
  logActivity,
  getAllAdminIds,
  getStoreSettings,
} from "@/lib/serverAuth";
import { sendMessage, sendPhotoBase64 } from "@/lib/bot";
import { fragmentLink, type FragmentTarget } from "@/lib/fragment";
import type { OrderStatus } from "@/lib/types";

/** Max receipt size: ~4MB binary (base64 is ~33% larger) */
const MAX_RECEIPT_B64 = 6_000_000;

function adminOrderKeyboard(orderId: number, fragment?: FragmentTarget) {
  const rows: Record<string, unknown>[][] = [
    [
      { text: "✅ Qabul qilish", callback_data: `ord:${orderId}:paid` },
      { text: "🏁 Bajarildi", callback_data: `ord:${orderId}:completed` },
    ],
  ];
  if (fragment) {
    rows.push([{ text: "🚀 Fragment'da bajarish", url: fragment.url }]);
  }
  rows.push([{ text: "❌ Rad etish", callback_data: `ord:${orderId}:rejected` }]);
  return { inline_keyboard: rows };
}

export const dynamic = "force-dynamic";

/** List the requesting user's orders */
export async function GET(req: NextRequest) {
  const auth = getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`orders-get:${auth.telegramId}`, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const user = await upsertUser(auth);
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt));
  // Strip heavy receipt payloads from list responses
  const light = rows.map(({ receiptData, ...rest }) => ({
    ...rest,
    hasReceipt: !!receiptData,
  }));
  return NextResponse.json({ orders: light });
}

/** Create an order from checkout */
export async function POST(req: NextRequest) {
  const auth = getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`orders-post:${auth.telegramId}`, 10)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: {
    packageId?: number;
    username?: string;
    comment?: string;
    paymentMethod?: string;
    receiptData?: string;
    receiptMime?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const packageId = Number(body.packageId);
  if (!Number.isInteger(packageId) || packageId <= 0) {
    return NextResponse.json({ error: "Invalid package" }, { status: 400 });
  }
  const username = sanitize(body.username, 64);
  if (!username) {
    return NextResponse.json(
      { error: "Telegram username is required" },
      { status: 400 }
    );
  }

  const [pkg] = await db
    .select()
    .from(packages)
    .where(eq(packages.id, packageId))
    .limit(1);
  if (!pkg || !pkg.active || !pkg.available) {
    return NextResponse.json(
      { error: "Package is not available" },
      { status: 404 }
    );
  }

  // Payment validation
  const paymentMethod =
    body.paymentMethod === "visa" || body.paymentMethod === "humo"
      ? body.paymentMethod
      : null;
  if (!paymentMethod) {
    return NextResponse.json(
      { error: "Select a payment method (Visa or Humo)" },
      { status: 400 }
    );
  }
  const receiptData =
    typeof body.receiptData === "string" &&
    body.receiptData.length > 100 &&
    body.receiptData.length <= MAX_RECEIPT_B64 &&
    /^[A-Za-z0-9+/=]+$/.test(body.receiptData)
      ? body.receiptData
      : null;
  if (!receiptData) {
    return NextResponse.json(
      { error: "Payment receipt image is required" },
      { status: 400 }
    );
  }
  const receiptMime =
    body.receiptMime === "image/png" ? "image/png" : "image/jpeg";

  const user = await upsertUser(auth);
  const initialStatus: OrderStatus = "paid";
  const history = JSON.stringify([
    { status: "pending", at: new Date().toISOString(), by: "user" },
    { status: initialStatus, at: new Date().toISOString(), by: "user:receipt" },
  ]);

  const [order] = await db
    .insert(orders)
    .values({
      userId: user.id,
      packageId: pkg.id,
      packageType: pkg.type,
      packageTitle: pkg.title,
      packageEmoji: pkg.emoji,
      price: pkg.price,
      telegramUsername: username.startsWith("@") ? username : `@${username}`,
      telegramId: auth.telegramId,
      comment: sanitize(body.comment, 300) || null,
      status: initialStatus,
      paymentMethod,
      receiptData,
      receiptMime,
      statusHistory: history,
    })
    .returning();

  await Promise.all([
    db.insert(notifications).values({
      userId: user.id,
      type: "success",
      title: "Order created",
      message: `Order #${order.id} — ${pkg.title} was placed successfully.`,
    }),
    logActivity(
      auth.telegramId,
      "order.created",
      `Order #${order.id}: ${pkg.title} ($${pkg.price}) by @${
        auth.username ?? auth.telegramId
      }`
    ),
  ]);

  // ---- Notify all admins via the Telegram bot (receipt photo + details) ----
  try {
    const [adminIds, storeSettings] = await Promise.all([
      getAllAdminIds(),
      getStoreSettings(),
    ]);
    const fragment = fragmentLink({
      packageType: pkg.type,
      packageTitle: pkg.title,
      telegramUsername: order.telegramUsername,
      starsAmount: pkg.starsAmount,
      duration: pkg.duration,
    });
    const caption =
      `🆕 <b>Yangi buyurtma #${order.id}</b>\n\n` +
      `${pkg.emoji} <b>${pkg.title}</b>\n` +
      `💵 Narx: <b>${pkg.price} ${storeSettings.currency}</b>\n` +
      `💳 To'lov: <b>${paymentMethod === "visa" ? "VISA" : "HUMO"}</b>\n` +
      `👤 Mijoz: ${order.telegramUsername} (ID: <code>${auth.telegramId}</code>)\n` +
      (order.comment ? `💬 Izoh: ${order.comment}\n` : "") +
      `\n📎 To'lov cheki biriktirilgan — tekshirib tasdiqlang.\n` +
      `🚀 Tasdiqlagach, Fragment tugmasi bilan 2 bosishda yetkazing.`;
    await Promise.all(
      adminIds.map(async (adminId) => {
        const ok = await sendPhotoBase64(
          adminId,
          receiptData,
          receiptMime,
          caption,
          { reply_markup: adminOrderKeyboard(order.id, fragment) }
        );
        if (!ok) {
          await sendMessage(adminId, caption, {
            reply_markup: adminOrderKeyboard(order.id, fragment),
          });
        }
      })
    );
  } catch {
    // Bot delivery must never break order creation
  }

  // Strip the heavy receipt payload from the response
  const { receiptData: _omit, ...orderLight } = order;
  return NextResponse.json({ order: orderLight }, { status: 201 });
}
