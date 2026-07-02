"use client";

/**
 * Telegram Mini App SDK helpers.
 * Wraps window.Telegram.WebApp with safe fallbacks so the app also
 * runs in a normal browser (demo mode).
 */

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser };
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  onEvent?: (event: string, cb: () => void) => void;
  disableVerticalSwipes?: () => void;
  enableClosingConfirmation?: () => void;
  isVersionAtLeast?: (v: string) => boolean;
  HapticFeedback?: {
    impactOccurred: (
      style: "light" | "medium" | "heavy" | "rigid" | "soft"
    ) => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

/** Demo user used when the app is opened outside of Telegram */
export const DEMO_USER: TgUser = {
  id: 7367129888,
  first_name: "Muso",
  last_name: "Rozaqov",
  username: "muso_rozaqov",
};

export function getTgUser(): TgUser {
  const wa = getWebApp();
  if (wa?.initDataUnsafe?.user) return wa.initDataUnsafe.user;
  return DEMO_USER;
}

/** Auth headers sent with every API request */
export function authHeaders(): Record<string, string> {
  const wa = getWebApp();
  if (wa?.initData) return { "x-telegram-init-data": wa.initData };
  return { "x-demo-user": JSON.stringify(DEMO_USER) };
}

export async function api<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/* ---------------- Haptics ---------------- */

export const haptic = {
  light: () => getWebApp()?.HapticFeedback?.impactOccurred("light"),
  medium: () => getWebApp()?.HapticFeedback?.impactOccurred("medium"),
  success: () => getWebApp()?.HapticFeedback?.notificationOccurred("success"),
  error: () => getWebApp()?.HapticFeedback?.notificationOccurred("error"),
  select: () => getWebApp()?.HapticFeedback?.selectionChanged(),
};

/* ---------------- Theme ---------------- */

export function detectTheme(): "light" | "dark" {
  const wa = getWebApp();
  if (wa?.colorScheme) return wa.colorScheme;
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

export function initTelegram(onThemeChange: (t: "light" | "dark") => void) {
  const wa = getWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
  wa.setHeaderColor?.("secondary_bg_color");
  // Mobile UX: prevent accidental swipe-to-close while scrolling lists
  try {
    if (!wa.isVersionAtLeast || wa.isVersionAtLeast("7.7")) {
      wa.disableVerticalSwipes?.();
    }
    wa.enableClosingConfirmation?.();
  } catch {
    /* older clients */
  }
  wa.onEvent?.("themeChanged", () => onThemeChange(wa.colorScheme));
}

export function formatPrice(price: string | number, currency: string) {
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (currency === "USD" || currency === "$") return `$${n.toFixed(2)}`;
  return `${n.toLocaleString()} ${currency}`;
}
