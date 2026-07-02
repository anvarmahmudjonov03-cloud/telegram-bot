/**
 * Fragment quick-fulfillment helpers.
 *
 * Fragment has no public API, so full automation would require a session
 * cookie + TON wallet (fragile). Instead we generate precise deep links so
 * the admin fulfills an approved order in ~2 taps:
 *   premium → https://fragment.com/premium/gift?recipient=<user>&months=<n>
 *   stars   → https://fragment.com/stars/buy?recipient=<user>&quantity=<n>
 *   gift    → https://t.me/<user> (collectible gifts are sent inside Telegram)
 */

export interface FragmentTarget {
  url: string;
  label: string;
}

/** Extract the month count from a duration/title like "3 Months Premium" */
export function parseMonths(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.match(/(\d+)\s*(month|oy|мес)/i) ?? text.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return [1, 3, 6, 12].includes(n) ? n : n > 0 ? n : null;
}

/** Extract the stars quantity from a title like "500 Stars" */
export function parseStars(
  amount: number | null | undefined,
  title: string | null | undefined
): number | null {
  if (amount && amount > 0) return amount;
  const m = title?.match(/(\d[\d\s,._]*)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[\s,._]/g, ""), 10);
  return n > 0 ? n : null;
}

export function fragmentLink(input: {
  packageType: string;
  packageTitle: string;
  telegramUsername: string;
  starsAmount?: number | null;
  duration?: string | null;
}): FragmentTarget {
  const user = input.telegramUsername.replace(/^@/, "").trim();

  if (input.packageType === "stars") {
    const qty = parseStars(input.starsAmount, input.packageTitle);
    const params = new URLSearchParams();
    if (user) params.set("recipient", user);
    if (qty) params.set("quantity", String(qty));
    const qs = params.toString();
    return {
      url: `https://fragment.com/stars/buy${qs ? `?${qs}` : ""}`,
      label: `⭐ Fragment: ${qty ? `${qty.toLocaleString()} Stars` : "Stars"} → @${user}`,
    };
  }

  if (input.packageType === "premium") {
    const months =
      parseMonths(input.duration) ?? parseMonths(input.packageTitle);
    const params = new URLSearchParams();
    if (user) params.set("recipient", user);
    if (months) params.set("months", String(months));
    const qs = params.toString();
    return {
      url: `https://fragment.com/premium/gift${qs ? `?${qs}` : ""}`,
      label: `💎 Fragment: Premium ${months ? `${months} oy` : ""} → @${user}`,
    };
  }

  // Collectible gifts are sent from inside Telegram itself
  return {
    url: user ? `https://t.me/${user}` : "https://t.me",
    label: `🎁 Telegram'da sovg'a yuborish → @${user}`,
  };
}
