import crypto from "crypto";

/**
 * Deployment identity helpers.
 *
 * E2B sandboxes expose their ID via env, and the public URL is always
 * `https://3000-{id}.e2b.app`. Knowing our own public origin at boot lets
 * every fresh deployment claim the bot and retire the previous instance
 * without any manual step.
 */

export function ownOrigin(): string | null {
  const id = process.env.E2B_SANDBOX_ID?.trim();
  if (id) return `https://3000-${id}.e2b.app`;
  return null;
}

/** Shared secret between deployments — both know the bot token. */
export function retireSecret(token: string): string {
  return crypto.createHash("sha256").update(`retire:${token}`).digest("hex");
}

/** Global "this instance is retired" flag (survives HMR) */
const g = globalThis as typeof globalThis & { __retiredTo?: string };

export function markRetired(newUrl: string): void {
  g.__retiredTo = newUrl;
}

export function retiredTo(): string | null {
  return g.__retiredTo ?? null;
}
