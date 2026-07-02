import { NextRequest, NextResponse } from "next/server";
import { processUpdate, type TgUpdate } from "@/lib/botHandlers";
import { requestOrigin } from "@/lib/autohook";

export const dynamic = "force-dynamic";

/**
 * Telegram webhook endpoint — kept as a fallback transport.
 * The primary transport is the long-polling loop (src/lib/poller.ts) which
 * is immune to deployment URL changes. If a webhook is ever configured,
 * this route handles updates identically via the shared processor.
 * Always answers 200 so Telegram never retry-loops.
 */
export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TgUpdate;
    await processUpdate(update, requestOrigin(req));
  } catch {
    // ignore malformed payloads
  }
  return NextResponse.json({ ok: true });
}
