import { db } from "@/db";
import { orders, notifications, packages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fragmentLink } from "@/lib/fragment";
import { isAdmin, getStoreSettings, logActivity } from "@/lib/serverAuth";
import {
  sendMessage,
  answerCallbackQuery,
  editMessageCaption,
  editMessageText,
  getAppUrl,
  saveAppUrl,
} from "@/lib/bot";
import { STATUS_META, type OrderStatus } from "@/lib/types";

/**
 * Shared Telegram update processor.
 * Used by BOTH the webhook route and the long-polling loop, so the bot
 * behaves identically no matter how updates arrive.
 */

export interface TgUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number; first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: {
      message_id: number;
      chat: { id: number };
      caption?: string;
      text?: string;
    };
  };
}

const STATUS_UZ: Record<string, string> = {
  paid: "✅ Qabul qilindi",
  completed: "🏁 Bajarildi",
  rejected: "❌ Rad etildi",
};

/** Process a single update. Never throws. */
export async function processUpdate(
  update: TgUpdate,
  liveOrigin?: string | null
): Promise<void> {
  try {
    await handle(update, liveOrigin);
  } catch {
    // Swallow — one bad update must not break the loop / webhook.
  }
}

async function handle(update: TgUpdate, liveOrigin?: string | null) {
  // ---------- /start ----------
  if (update.message?.text?.startsWith("/start")) {
    const chatId = update.message.chat.id;
    const [settings, savedUrl] = await Promise.all([
      getStoreSettings(),
      getAppUrl(),
    ]);
    // Prefer the live origin (proves the host is reachable right now).
    const appUrl = liveOrigin ?? savedUrl;
    if (liveOrigin && liveOrigin !== savedUrl) void saveAppUrl(liveOrigin);

    const kb: Record<string, unknown>[][] = [];
    if (appUrl) {
      kb.push([{ text: "🛍 Do'konni ochish", web_app: { url: appUrl } }]);
    }
    if (settings.requiredChannel) {
      const ch = settings.requiredChannel.replace(/^@/, "");
      kb.push([{ text: "📢 Kanalga a'zo bo'lish", url: `https://t.me/${ch}` }]);
    }
    await sendMessage(
      chatId,
      `👋 Assalomu alaykum, <b>${update.message.from?.first_name ?? "do'st"}</b>!\n\n` +
        `⭐ <b>${settings.storeName}</b> — Telegram Premium, Stars va Gifts do'koni.\n\n` +
        `💎 Premium obunalar\n⭐ Stars paketlari\n🎁 Kolleksion sovg'alar\n\n` +
        `Xarid qilish uchun quyidagi tugmani bosing 👇`,
      kb.length ? { reply_markup: { inline_keyboard: kb } } : {}
    );
    return;
  }

  // ---------- Any other text message: gentle hint ----------
  if (update.message?.text && !update.message.text.startsWith("/")) {
    await sendMessage(
      update.message.chat.id,
      "Do'konni ochish uchun /start buyrug'ini yuboring 🛍"
    );
    return;
  }

  // ---------- Admin order action buttons ----------
  const cq = update.callback_query;
  if (cq?.data?.startsWith("ord:")) {
    const [, idStr, status] = cq.data.split(":");
    const orderId = parseInt(idStr, 10);
    const newStatus = status as OrderStatus;

    if (!(await isAdmin(cq.from.id))) {
      await answerCallbackQuery(cq.id, "⛔ Siz admin emassiz");
      return;
    }
    if (
      !Number.isInteger(orderId) ||
      !["paid", "completed", "rejected"].includes(newStatus)
    ) {
      await answerCallbackQuery(cq.id, "Noto'g'ri so'rov");
      return;
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) {
      await answerCallbackQuery(cq.id, "Buyurtma topilmadi");
      return;
    }

    // Update status + history
    const history = JSON.parse(order.statusHistory || "[]") as unknown[];
    history.push({
      status: newStatus,
      at: new Date().toISOString(),
      by: `admin:${cq.from.id}:bot`,
    });
    await db
      .update(orders)
      .set({
        status: newStatus,
        statusHistory: JSON.stringify(history),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    const meta = STATUS_META[newStatus];
    await Promise.all([
      db.insert(notifications).values({
        userId: order.userId,
        type:
          newStatus === "completed"
            ? "success"
            : newStatus === "rejected"
              ? "error"
              : "info",
        title: `Order #${order.id} ${meta.label.toLowerCase()}`,
        message: `Your order "${order.packageTitle}" status changed to ${meta.label}.`,
      }),
      logActivity(
        cq.from.id,
        "order.updated",
        `Order #${order.id} → ${newStatus} (via bot)`
      ),
      // Notify the customer directly in Telegram
      sendMessage(
        order.telegramId,
        `${STATUS_UZ[newStatus]}\n\n` +
          `📦 Buyurtma #${order.id} — <b>${order.packageTitle}</b>\n` +
          (newStatus === "completed"
            ? "🎉 Xaridingiz uchun rahmat!"
            : newStatus === "rejected"
              ? "To'lov cheki tasdiqlanmadi. Savollar bo'lsa support bilan bog'laning."
              : "Buyurtmangiz qabul qilindi va tez orada bajariladi.")
      ),
      answerCallbackQuery(cq.id, `Holat: ${meta.label}`),
    ]);

    // On approval → send the admin a ready-made Fragment fulfillment link
    // (recipient + amount pre-filled) so delivery takes ~2 taps.
    if (newStatus === "paid") {
      try {
        const [pkg] = order.packageId
          ? await db
              .select()
              .from(packages)
              .where(eq(packages.id, order.packageId))
              .limit(1)
          : [];
        const frag = fragmentLink({
          packageType: order.packageType,
          packageTitle: order.packageTitle,
          telegramUsername: order.telegramUsername,
          starsAmount: pkg?.starsAmount ?? null,
          duration: pkg?.duration ?? null,
        });
        await sendMessage(
          cq.from.id,
          `🚀 <b>Buyurtma #${order.id} — yetkazib berish</b>\n\n` +
            `${frag.label}\n\n` +
            `Quyidagi tugma orqali oching — qabul qiluvchi va miqdor oldindan to'ldirilgan. ` +
            `Yetkazib bo'lgach, buyurtma xabaridagi «🏁 Bajarildi» tugmasini bosing.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🚀 Fragment'da bajarish", url: frag.url }],
                [
                  {
                    text: "🏁 Bajarildi deb belgilash",
                    callback_data: `ord:${order.id}:completed`,
                  },
                ],
              ],
            },
          }
        );
      } catch {
        // Fulfillment helper must never break the status flow
      }
    }

    // Update the admin message to reflect the new state
    if (cq.message) {
      const stamp = `\n\n${STATUS_UZ[newStatus]} (admin: ${cq.from.id})`;
      if (cq.message.caption !== undefined) {
        await editMessageCaption(
          cq.message.chat.id,
          cq.message.message_id,
          cq.message.caption + stamp
        );
      } else if (cq.message.text) {
        await editMessageText(
          cq.message.chat.id,
          cq.message.message_id,
          cq.message.text + stamp
        );
      }
    }
  }
}
