import { NextRequest, NextResponse } from "next/server";
import { getBotToken } from "@/lib/bot";
import { retireSecret, markRetired } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * Called by a NEWER deployment to retire this instance:
 * stops the polling loop and records the successor URL so clients
 * on the old link are redirected to the live deployment.
 * Authenticated with a secret derived from the shared bot token.
 */
export async function POST(req: NextRequest) {
  const token = await getBotToken();
  if (!token) return NextResponse.json({ ok: false }, { status: 400 });

  let body: { secret?: string; newUrl?: string };
  try {
    body = (await req.json()) as { secret?: string; newUrl?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (body.secret !== retireSecret(token) || !body.newUrl?.startsWith("https://")) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  markRetired(body.newUrl);
  return NextResponse.json({ ok: true });
}
