import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  upsertUser,
  isAdmin,
  getStoreSettings,
  rateLimit,
} from "@/lib/serverAuth";
import { isChannelMember } from "@/lib/bot";
import { ensureWebhook } from "@/lib/autohook";
import { retiredTo } from "@/lib/origin";

export const dynamic = "force-dynamic";

/** Bootstrap endpoint: registers the user and returns profile + role + settings */
export async function POST(req: NextRequest) {
  // This deployment was superseded — send clients to the live URL.
  const successor = retiredTo();
  if (successor) {
    return NextResponse.json({ redirectTo: successor }, { status: 200 });
  }

  // Self-heal app URL / keep the bot loop alive
  ensureWebhook(req);

  const auth = getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`me:${auth.telegramId}`, 60)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const [user, admin, settings] = await Promise.all([
    upsertUser(auth),
    isAdmin(auth.telegramId),
    getStoreSettings(),
  ]);

  // Mandatory channel membership (admins are exempt).
  // null = cannot verify (bot not admin in channel) → do not block users.
  let needJoin = false;
  if (settings.requiredChannel && !admin) {
    const member = await isChannelMember(
      settings.requiredChannel,
      auth.telegramId
    );
    needJoin = member === false;
  }

  return NextResponse.json({ user, isAdmin: admin, settings, needJoin });
}
