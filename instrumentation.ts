/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * Bot transport: LONG-POLLING ONLY (permanent decision).
 * Sandbox URLs rotate on every publish, which silently kills webhooks and
 * leaves updates stuck in Telegram's queue. Long-polling is outbound-only:
 * it works 100% of the time no matter what the public URL is, as long as
 * this process is alive. The poller deletes any stale webhook itself.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startPoller } = await import("@/lib/poller");
  const { ownOrigin, retireSecret } = await import("@/lib/origin");

  // Start consuming updates IMMEDIATELY — never gated on anything else.
  startPoller();

  // Best-effort housekeeping (app URL for the /start button + retire old instance)
  void (async () => {
    try {
      const { getAppUrl, saveAppUrl, getBotToken } = await import("@/lib/bot");
      const origin = ownOrigin();
      if (!origin) return;
      const [prevUrl, token] = await Promise.all([getAppUrl(), getBotToken()]);
      if (token && prevUrl && prevUrl !== origin) {
        try {
          await fetch(`${prevUrl}/api/bot/retire`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              secret: retireSecret(token),
              newUrl: origin,
            }),
            signal: AbortSignal.timeout(8_000),
          });
        } catch {
          // previous sandbox already dead
        }
      }
      await saveAppUrl(origin);
    } catch {
      // never block boot
    }
  })();
}
