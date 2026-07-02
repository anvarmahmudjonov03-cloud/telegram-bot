import type { NextRequest } from "next/server";
import { saveAppUrl, getAppUrl } from "@/lib/bot";
import { ownOrigin } from "@/lib/origin";
import { startPoller } from "@/lib/poller";

/**
 * Watchdog helper called from hot request paths (/api/me, /api/packages,
 * /api/health). Guarantees two things at (almost) zero cost:
 *   1. The long-polling bot loop is alive (restarts it if it ever died).
 *   2. The stored app URL matches the current deployment, so the /start
 *      button in Telegram always opens a live host.
 */

let lastEnsureAt = 0;
const RECHECK_MS = 60_000;

export function requestOrigin(req: NextRequest): string | null {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (!host || host.startsWith("localhost") || host.startsWith("127.")) {
    return null; // internal healthchecks — not a public URL
  }
  return `https://${host}`;
}

/** Fire-and-forget: never throws, never blocks the response. */
export function ensureWebhook(req?: NextRequest): void {
  // Watchdog: restart the polling loop if it died (stale heartbeat).
  startPoller();

  const now = Date.now();
  if (now - lastEnsureAt < RECHECK_MS) return;
  lastEnsureAt = now;

  const origin = ownOrigin() ?? (req ? requestOrigin(req) : null);
  if (!origin) return;

  void (async () => {
    try {
      const saved = await getAppUrl();
      if (saved !== origin) await saveAppUrl(origin);
    } catch {
      // Best-effort — next request retries.
    }
  })();
}
