import { getBotToken } from "@/lib/bot";
import { processUpdate, type TgUpdate } from "@/lib/botHandlers";
import { retiredTo } from "@/lib/origin";

/**
 * Long-polling Telegram update loop.
 *
 * Sandbox/preview hosts rotate their public URL on every deploy, which makes
 * webhooks unreliable (they keep pointing at dead hosts). Long-polling is
 * outbound-only, so the bot answers 100% of the time regardless of the
 * public URL — as long as this server process is alive.
 *
 * The loop is a global singleton (survives HMR / route re-imports) and
 * self-heals: token appearing later, network hiccups and Telegram 409
 * conflicts are all retried with backoff. A heartbeat timestamp lets the
 * health endpoint restart the loop if it ever dies.
 */

interface PollerState {
  running: boolean;
  offset: number;
  startedAt: number;
  lastLoopAt: number;
  lastError: string;
  polls: number;
  updates: number;
  tokenSeen: boolean;
}

const g = globalThis as typeof globalThis & { __tgPoller?: PollerState };

const STALE_MS = 90_000; // loop silent this long → assume dead, restart

export function pollerStatus() {
  const s = g.__tgPoller;
  if (!s) return { running: false };
  return {
    running: s.running,
    aliveMsAgo: Date.now() - s.lastLoopAt,
    polls: s.polls,
    updates: s.updates,
    tokenSeen: s.tokenSeen,
    lastError: s.lastError,
  };
}

export function startPoller(): void {
  const s = g.__tgPoller;
  if (s?.running && Date.now() - s.lastLoopAt < STALE_MS) return;
  // Fresh start (or restart of a stale/dead loop)
  if (s) s.running = false; // signal any zombie loop to exit
  const state: PollerState = {
    running: true,
    offset: s?.offset ?? 0,
    startedAt: Date.now(),
    lastLoopAt: Date.now(),
    lastError: "",
    polls: 0,
    updates: 0,
    tokenSeen: false,
  };
  g.__tgPoller = state;
  void loop(state);
}

async function loop(state: PollerState): Promise<void> {
  let deletedWebhook = false;
  let lastWebhookDeleteAt = 0;

  while (state.running && g.__tgPoller === state) {
    state.lastLoopAt = Date.now();

    // A newer deployment retired us — stop consuming updates forever.
    if (retiredTo()) {
      state.running = false;
      state.lastError = `retired → ${retiredTo()}`;
      return;
    }

    try {
      const token = await getBotToken();
      if (!token) {
        state.tokenSeen = false;
        await sleep(10_000);
        continue;
      }
      state.tokenSeen = true;

      // getUpdates conflicts with an active webhook — remove it, but at most
      // once per 60s so competing instances don't hammer each other.
      if (!deletedWebhook && Date.now() - lastWebhookDeleteAt > 60_000) {
        try {
          await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
            method: "POST",
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          /* ignore */
        }
        deletedWebhook = true;
        lastWebhookDeleteAt = Date.now();
      }

      state.polls++;
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offset: state.offset,
            timeout: 20,
            allowed_updates: ["message", "callback_query"],
          }),
          signal: AbortSignal.timeout(30_000),
        }
      );
      const json = (await res.json()) as {
        ok: boolean;
        result?: TgUpdate[];
        error_code?: number;
        description?: string;
      };

      if (!json.ok) {
        state.lastError = `${json.error_code}: ${json.description ?? ""}`;
        // 409 = another consumer (stray webhook / old instance). Back off a
        // little with jitter — the retire protocol stops modern instances,
        // and legacy ones die with their sandbox shortly.
        if (json.error_code === 409) {
          deletedWebhook = false;
          await sleep(4_000 + Math.random() * 4_000);
        } else {
          await sleep(3_000);
        }
        continue;
      }

      state.lastError = "";
      for (const update of json.result ?? []) {
        if (typeof update.update_id === "number") {
          state.offset = update.update_id + 1;
        }
        state.updates++;
        // Sequential processing keeps order actions consistent.
        await processUpdate(update);
        state.lastLoopAt = Date.now();
      }
    } catch (e) {
      state.lastError = e instanceof Error ? e.message : String(e);
      await sleep(3_000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
