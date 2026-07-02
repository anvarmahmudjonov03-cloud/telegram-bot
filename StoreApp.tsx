"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  api,
  detectTheme,
  formatPrice,
  getTgUser,
  haptic,
  initTelegram,
} from "@/lib/telegram";
import type {
  MeResponse,
  OrderRow,
  PackageType,
  PaymentMethod,
  Pkg,
  StoreSettings,
} from "@/lib/types";
import {
  Avatar,
  Button,
  EmptyState,
  Field,
  GlassCard,
  Sheet,
  Skeleton,
  StatusBadge,
  ToastProvider,
  inputCls,
  useToast,
} from "@/components/ui";
import {
  LANGS,
  pickAnnouncement,
  statusLabel,
  useLang,
  type Lang,
  type TKey,
} from "@/lib/i18n";

type TFn = (k: TKey) => string;

const AdminPanel = dynamic(() => import("@/components/AdminPanel"), {
  loading: () => (
    <div className="space-y-4 p-4">
      <Skeleton className="h-24" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  ),
});

/* ================= Category metadata ================= */

const CATEGORIES: {
  type: PackageType;
  emoji: string;
  asset: string;
  titleKey: TKey;
  descKey: TKey;
  gradient: string;
}[] = [
  {
    type: "stars",
    emoji: "⭐",
    asset: "catStars",
    titleKey: "catStarsTitle",
    descKey: "catStarsDesc",
    gradient: "from-[#d8ac54]/70 to-[#a87b24]/70",
  },
  {
    type: "premium",
    emoji: "💎",
    asset: "catPremium",
    titleKey: "catPremiumTitle",
    descKey: "catPremiumDesc",
    gradient: "from-[#e6c67c]/70 to-[#b98a2e]/70",
  },
  {
    type: "gift",
    emoji: "🎁",
    asset: "catGift",
    titleKey: "catGiftTitle",
    descKey: "catGiftDesc",
    gradient: "from-[#caa14a]/70 to-[#8a6a1e]/70",
  },
];

type View = "home" | "catalog" | "orders" | "admin";

export default function StoreApp() {
  return (
    <ToastProvider>
      <StoreInner />
    </ToastProvider>
  );
}

function StoreInner() {
  const { toast } = useToast();
  const [lang, setLang, t] = useLang();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [view, setView] = useState<View>("home");
  const [catalogType, setCatalogType] = useState<PackageType>("stars");
  const [allPackages, setAllPackages] = useState<Pkg[] | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [checkout, setCheckout] = useState<Pkg | null>(null);
  const [search, setSearch] = useState("");
  const tgUser = useMemo(() => getTgUser(), []);

  /* Theme sync with Telegram */
  useEffect(() => {
    const t = detectTheme();
    setTheme(t);
    initTelegram(setTheme);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  /* Bootstrap */
  useEffect(() => {
    api<MeResponse & { redirectTo?: string }>("/api/me", { method: "POST" })
      .then((r) => {
        // Old deployment → hop to the live one automatically
        if (r.redirectTo) {
          window.location.replace(r.redirectTo);
          return;
        }
        setMe(r);
      })
      .catch((e: Error) => toast("error", t("connFail"), e.message));
    api<{ packages: Pkg[] }>("/api/packages")
      .then((r) => setAllPackages(r.packages))
      .catch(() => setAllPackages([]));
  }, [toast]);

  const loadOrders = useCallback(() => {
    api<{ orders: OrderRow[] }>("/api/orders")
      .then((r) => setOrders(r.orders))
      .catch(() => setOrders([]));
  }, []);
  useEffect(() => {
    if (view === "orders") loadOrders();
  }, [view, loadOrders]);

  const currency = me?.settings.currency ?? "USD";
  const startingPrice = (type: PackageType) => {
    const list = (allPackages ?? []).filter((p) => p.type === type);
    if (!list.length) return null;
    return Math.min(...list.map((p) => parseFloat(p.price)));
  };

  const openCatalog = (type: PackageType) => {
    haptic.medium();
    setCatalogType(type);
    setSearch("");
    setView("catalog");
  };

  const catalogPkgs = (allPackages ?? []).filter(
    (p) =>
      p.type === catalogType &&
      (search.trim() === "" ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const category = CATEGORIES.find((c) => c.type === catalogType)!;

  return (
    <div className="relative min-h-dvh">
      {/* Aurora mesh backdrop + floating sparkles */}
      <div className="aurora" />
      <div className="sparkle left-[12%] top-[18%] h-2.5 w-2.5" />
      <div className="sparkle right-[18%] top-[30%] h-2 w-2" style={{ animationDelay: "-3s" }} />
      <div className="sparkle left-[28%] bottom-[24%] h-3 w-3" style={{ animationDelay: "-5.5s" }} />
      <div className="sparkle right-[10%] bottom-[14%] h-2 w-2" style={{ animationDelay: "-7s" }} />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-56 flex-col gap-1 p-4 md:flex">
          <div className="border-glow glass mb-4 flex items-center gap-3 rounded-3xl p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/api/assets/storeLogo"
              alt="logo"
              className="glow-ring h-10 w-10 rounded-xl object-cover shadow-md"
            />
            <div className="min-w-0">
              <p className="text-gradient truncate text-lg font-extrabold">
                {me?.settings.storeName ?? "Premium Store"}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {t("miniApp")}
              </p>
            </div>
          </div>
          <SideLink active={view === "home"} onClick={() => setView("home")} asset="navHome" emoji="🏠" label={t("home")} />
          <SideLink active={view === "orders"} onClick={() => setView("orders")} asset="navOrders" emoji="📦" label={t("myOrders")} />
          {me?.isAdmin && (
            <SideLink active={view === "admin"} onClick={() => setView("admin")} asset="navAdmin" emoji="🛠️" label={t("admin")} />
          )}
          <div className="mt-auto">
            <LangSwitcher lang={lang} setLang={setLang} />
          </div>
        </aside>

        {/* Main content */}
        <main
          className="w-full flex-1 px-4 pt-4 md:pb-8"
          style={{ paddingBottom: "calc(7.5rem + env(safe-area-inset-bottom))" }}
        >
          {/* Announcement banner (localized) */}
          {me && pickAnnouncement(lang, me.settings) && view !== "admin" && (
            <div className="fade-up glass mb-4 rounded-2xl border-l-4 border-[var(--gold)] px-4 py-3 text-sm">
              📢 {pickAnnouncement(lang, me.settings)}
            </div>
          )}

          {me?.needJoin && !me.isAdmin ? (
            <JoinChannelGate
              channel={me.settings.requiredChannel}
              t={t}
              onCheck={() =>
                api<MeResponse>("/api/me", { method: "POST" })
                  .then((r) => {
                    setMe(r);
                    if (r.needJoin)
                      toast("warning", t("joinMissing"), t("joinMissingSub"));
                    else toast("success", t("joinOk"), t("joinOkSub"));
                  })
                  .catch(() => {})
              }
            />
          ) : me?.settings.maintenanceMode && !me.isAdmin ? (
            <EmptyState
              emoji="🔧"
              title={t("maintenance")}
              subtitle={t("maintenanceSub")}
            />
          ) : view === "home" ? (
            <HomeView
              me={me}
              tgUserName={[tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ")}
              tgUserId={tgUser.id}
              tgUsername={tgUser.username}
              photoUrl={tgUser.photo_url}
              currency={currency}
              loading={allPackages === null}
              startingPrice={startingPrice}
              onOpen={openCatalog}
              t={t}
              lang={lang}
              setLang={setLang}
            />
          ) : view === "catalog" ? (
            <div className="fade-up">
              <BackBar
                title={t(category.titleKey)}
                onBack={() => setView("home")}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`${t("search")}: ${t(category.titleKey)}…`}
                className={`${inputCls} mb-4`}
              />
              {allPackages === null ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              ) : catalogPkgs.length === 0 ? (
                <EmptyState
                  emoji={category.emoji}
                  title={t("nothingHere")}
                  subtitle={t("nothingHereSub")}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {catalogPkgs.map((p, i) => (
                    <PackageCard
                      key={p.id}
                      pkg={p}
                      currency={currency}
                      delay={i * 60}
                      t={t}
                      onBuy={() => {
                        haptic.medium();
                        setCheckout(p);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : view === "orders" ? (
            <OrdersView orders={orders} currency={currency} t={t} lang={lang} />
          ) : me?.isAdmin ? (
            <AdminPanel currency={currency} />
          ) : null}
        </main>
      </div>

      {/* Bottom navigation (mobile, safe-area aware) */}
      <nav
        className="glass-strong fixed inset-x-3 z-40 flex items-center justify-around rounded-3xl px-2 py-2 md:hidden"
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <NavBtn active={view === "home"} asset="navHome" emoji="🏠" label={t("home")} onClick={() => setView("home")} />
        <NavBtn active={view === "orders"} asset="navOrders" emoji="📦" label={t("orders")} onClick={() => setView("orders")} />
        {me?.isAdmin && (
          <NavBtn active={view === "admin"} asset="navAdmin" emoji="🛠️" label={t("admin")} onClick={() => setView("admin")} />
        )}
      </nav>

      {/* Checkout sheet */}
      <CheckoutSheet
        pkg={checkout}
        currency={currency}
        tgId={tgUser.id}
        defaultUsername={tgUser.username ?? ""}
        settings={me?.settings ?? null}
        t={t}
        onClose={() => setCheckout(null)}
        onCreated={() => {
          setCheckout(null);
          setView("orders");
          loadOrders();
        }}
      />
    </div>
  );
}

/* ================= Mandatory channel gate ================= */

function JoinChannelGate({
  channel,
  t,
  onCheck,
}: {
  channel: string;
  t: TFn;
  onCheck: () => void;
}) {
  const ch = channel.replace(/^@/, "");
  return (
    <div className="fade-up flex flex-col items-center justify-center py-16 text-center">
      <div className="border-glow glass mb-5 flex h-24 w-24 items-center justify-center rounded-2xl text-5xl">
        📢
      </div>
      <h2 className="text-xl font-extrabold">{t("joinTitle")}</h2>
      <p className="mt-2 max-w-xs text-sm text-[var(--text-secondary)]">
        {t("joinSub")} <b>@{ch}</b>
      </p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
        <a
          href={`https://t.me/${ch}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-lux pressable rounded-xl px-5 py-3.5 text-sm font-bold"
          onClick={() => haptic.medium()}
        >
          {t("joinBtn")}
        </a>
        <Button variant="secondary" onClick={onCheck}>
          {t("checkBtn")}
        </Button>
      </div>
    </div>
  );
}

/* ================= Sub components ================= */

/** Nav icon: custom uploaded image with emoji fallback (always constrained) */
function NavIcon({
  asset,
  emoji,
  size = 24,
}: {
  asset: string;
  emoji: string;
  size?: number;
}) {
  const [err, setErr] = useState(false);
  if (err) return <span style={{ fontSize: size - 4 }}>{emoji}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/assets/${asset}`}
      alt=""
      width={size}
      height={size}
      onError={() => setErr(true)}
      className="shrink-0 rounded-lg object-cover"
      style={{ width: size, height: size, maxWidth: size, maxHeight: size }}
    />
  );
}

/**
 * Category logo box (56×56). When a custom image is uploaded it fills the
 * whole rounded box (object-cover); otherwise the gradient + emoji shows.
 * Used on home cards AND inside catalog package rows, so updating the logo
 * in Settings changes both places at once.
 */
function CatLogo({
  asset,
  emoji,
  gradient,
  className = "",
}: {
  asset: string;
  emoji: string;
  gradient: string;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  return (
    <div
      className={`relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-lg ${
        err ? `gradient-animate bg-gradient-to-br ${gradient}` : ""
      } ${className}`}
    >
      {err ? (
        <span className="text-3xl">{emoji}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/assets/${asset}`}
          alt=""
          onError={() => setErr(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

/** Map a package type to its category logo asset key */
const CAT_ASSET: Record<PackageType, { asset: string; gradient: string }> = {
  stars: { asset: "catStars", gradient: "from-[#d8ac54]/70 to-[#a87b24]/70" },
  premium: { asset: "catPremium", gradient: "from-[#e6c67c]/70 to-[#b98a2e]/70" },
  gift: { asset: "catGift", gradient: "from-[#caa14a]/70 to-[#8a6a1e]/70" },
};

function LangSwitcher({
  lang,
  setLang,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  return (
    <div className="glass flex items-center justify-center gap-1 rounded-2xl p-1">
      {LANGS.map((l) => (
        <button
          key={l.id}
          onClick={() => {
            haptic.select();
            setLang(l.id);
          }}
          className={`pressable flex-1 rounded-xl px-2 py-1.5 text-xs font-bold transition-all ${
            lang === l.id
              ? "btn-lux shadow-md"
              : "text-[var(--text-secondary)]"
          }`}
        >
          {l.flag} {l.id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SideLink({
  active,
  onClick,
  asset,
  emoji,
  label,
}: {
  active: boolean;
  onClick: () => void;
  asset: string;
  emoji: string;
  label: string;
}) {
  return (
    <button
      onClick={() => {
        haptic.select();
        onClick();
      }}
      className={`pressable flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
        active
          ? "glass text-[var(--gold)]"
          : "text-[var(--text-secondary)] hover:bg-white/20 dark:hover:bg-white/5"
      }`}
    >
      <NavIcon asset={asset} emoji={emoji} size={22} />
      {label}
    </button>
  );
}

function NavBtn({
  active,
  asset,
  emoji,
  label,
  onClick,
}: {
  active: boolean;
  asset: string;
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => {
        haptic.select();
        onClick();
      }}
      className={`pressable nav-pill flex flex-col items-center gap-0.5 rounded-2xl px-5 py-1.5 transition-all ${
        active ? "active scale-110" : "opacity-60"
      }`}
    >
      <span className={active ? "icon-bounce" : ""}>
        <NavIcon asset={asset} emoji={emoji} size={24} />
      </span>
      <span
        className={`text-[10px] font-semibold ${active ? "text-[var(--gold)]" : "text-[var(--text-secondary)]"}`}
      >
        {label}
      </span>
    </button>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        onClick={() => {
          haptic.light();
          onBack();
        }}
        className="pressable glass flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
      >
        ←
      </button>
      <h2 className="text-xl font-bold">{title}</h2>
    </div>
  );
}

function HomeView({
  me,
  tgUserName,
  tgUserId,
  tgUsername,
  photoUrl,
  currency,
  loading,
  startingPrice,
  onOpen,
  t,
  lang,
  setLang,
}: {
  me: MeResponse | null;
  tgUserName: string;
  tgUserId: number;
  tgUsername?: string;
  photoUrl?: string | null;
  currency: string;
  loading: boolean;
  startingPrice: (t: PackageType) => number | null;
  onOpen: (t: PackageType) => void;
  t: TFn;
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  return (
    <div className="fade-up space-y-5">
      {/* Profile header — passport-style strip */}
      <div className="border-glow shine glass zoom-in relative overflow-hidden rounded-2xl p-4">
        <div className="relative flex items-center gap-4">
          <div className="glow-ring rounded-xl">
            <Avatar name={tgUserName || "User"} photoUrl={photoUrl} size={52} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="micro-label">Member</p>
            <p className="truncate text-base font-extrabold tracking-tight">
              {tgUserName || "Telegram User"}
            </p>
            <p className="truncate font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
              {tgUsername ? `@${tgUsername} · ` : ""}ID {tgUserId}
            </p>
          </div>
          {me?.isAdmin && (
            <span className="rounded-md border border-[var(--gold)] px-2.5 py-1 text-[10px] font-extrabold tracking-[0.14em] text-[var(--gold)]">
              ADMIN
            </span>
          )}
        </div>
      </div>

      {/* Language switcher (mobile) */}
      <div className="md:hidden">
        <LangSwitcher lang={lang} setLang={setLang} />
      </div>

      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/api/assets/storeLogo"
          alt="logo"
          className="h-12 w-12 rounded-2xl object-cover shadow-lg md:hidden"
        />
        <div>
          <p className="micro-label">✦ Boutique</p>
          <h1 className="text-[26px] font-black leading-tight tracking-tighter">
            <span className="text-gradient">
              {me?.settings.storeName ?? "Premium Store"}
            </span>
          </h1>
          <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
            {t("tagline")}
          </p>
        </div>
      </div>

      {/* Category cards — numbered editorial rows with corner ticks */}
      <div className="stagger grid grid-cols-1 gap-3">
        {CATEGORIES.map((c, idx) => {
          const from = startingPrice(c.type);
          return (
            <button
              key={c.type}
              onClick={() => {
                haptic.medium();
                onOpen(c.type);
              }}
              className="border-glow card-hover shine glass relative w-full overflow-hidden rounded-2xl p-4 text-left"
            >
              <div className="relative flex items-center gap-4">
                <span className="index-num hidden w-9 shrink-0 text-lg sm:block">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="icon-bounce float-slow">
                  <CatLogo
                    asset={c.asset}
                    emoji={c.emoji}
                    gradient={c.gradient}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="micro-label">{t(c.descKey).split(" ").slice(0, 3).join(" ")}</p>
                  <p className="mt-0.5 text-lg font-extrabold tracking-tight">
                    {t(c.titleKey)}
                  </p>
                  <div className="mt-1">
                    {loading ? (
                      <Skeleton className="h-4 w-20 rounded" />
                    ) : (
                      <span className="text-sm font-extrabold tabular-nums text-[var(--gold)]">
                        {from !== null
                          ? `${formatPrice(from, currency)} ${t("from")}`
                          : t("comingSoon")}
                      </span>
                    )}
                  </div>
                </div>
                <span className="btn-lux pressable shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold">
                  {t("buy")} →
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Support / channel */}
      <GlassCard className="fade-up flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-semibold">{t("needHelp")}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            {t("support")}: {me?.settings.supportUsername ?? "@support"} ·{" "}
            {t("channel")}: {me?.settings.telegramChannel ?? "@channel"}
          </p>
        </div>
        <span className="float-slow text-2xl">💬</span>
      </GlassCard>
    </div>
  );
}

function PackageCard({
  pkg,
  currency,
  onBuy,
  delay,
  t,
}: {
  pkg: Pkg;
  currency: string;
  onBuy: () => void;
  delay: number;
  t: TFn;
}) {
  const sub =
    pkg.type === "stars" && pkg.starsAmount
      ? `${pkg.starsAmount.toLocaleString()} ⭐`
      : pkg.type === "premium" && pkg.duration
        ? pkg.duration
        : null;
  return (
    <GlassCard hover className="fade-up shine p-4" onClick={onBuy}>
      <div style={{ animationDelay: `${delay}ms` }} className="flex gap-3">
        <span className="icon-bounce shrink-0">
          {pkg.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pkg.imageUrl}
              alt={pkg.title}
              className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-md"
            />
          ) : (
            <CatLogo
              asset={CAT_ASSET[pkg.type].asset}
              emoji={pkg.emoji}
              gradient={CAT_ASSET[pkg.type].gradient}
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold leading-tight">{pkg.title}</p>
            {!pkg.available && (
              <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500">
                {t("soldOut")}
              </span>
            )}
          </div>
          {sub && (
            <p className="text-xs font-semibold text-[var(--gold)]">{sub}</p>
          )}
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
            {pkg.description}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-base font-extrabold tabular-nums">
              {formatPrice(pkg.price, currency)}
            </span>
            <span className="btn-lux pressable rounded-lg px-4 py-1.5 text-xs font-bold">
              {t("buy")}
            </span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

function OrdersView({
  orders,
  currency,
  t,
  lang,
}: {
  orders: OrderRow[] | null;
  currency: string;
  t: TFn;
  lang: Lang;
}) {
  return (
    <div className="fade-up">
      <h2 className="mb-4 text-xl font-extrabold tracking-tight">
        <span className="text-gradient">{t("myOrders")}</span>
      </h2>
      {orders === null ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          emoji="🛍️"
          title={t("noOrders")}
          subtitle={t("noOrdersSub")}
        />
      ) : (
        <div className="stagger space-y-3">
          {orders.map((o) => (
            <GlassCard key={o.id} hover className="p-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="icon-bounce flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--gold-soft)] text-xl">
                    {o.packageEmoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      #{o.id} · {o.packageTitle}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {new Date(o.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-extrabold tabular-nums">
                      {formatPrice(o.price, currency)}
                    </span>
                    <StatusBadge
                      status={o.status}
                      label={statusLabel(lang, o.status)}
                    />
                  </div>
                </div>
                {o.adminNote && (
                  <p className="mt-2 rounded-xl bg-[var(--gold-soft)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                    💬 {o.adminNote}
                  </p>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Checkout (3 steps) ================= */

/** Downscale + compress the receipt image client-side (max 1280px JPEG) */
async function compressImage(
  file: File
): Promise<{ base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: out.split(",")[1], mime: "image/jpeg" };
}

function CheckoutSheet({
  pkg,
  currency,
  tgId,
  defaultUsername,
  settings,
  t,
  onClose,
  onCreated,
}: {
  pkg: Pkg | null;
  currency: string;
  tgId: number;
  defaultUsername: string;
  settings: StoreSettings | null;
  t: TFn;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState(defaultUsername);
  const [comment, setComment] = useState("");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [receipt, setReceipt] = useState<{ base64: string; mime: string; preview: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pkg) {
      setStep(1);
      setUsername(defaultUsername);
      setComment("");
      setMethod(null);
      setReceipt(null);
    }
  }, [pkg, defaultUsername]);

  const cards: {
    id: PaymentMethod;
    logo: string;
    number: string;
    holder: string;
    gradient: string;
  }[] = [
    {
      id: "visa" as PaymentMethod,
      logo: "/api/assets/visaLogo",
      number: settings?.visaCard ?? "",
      holder: settings?.visaHolder ?? "",
      gradient: "from-[#1434CB]/90 to-[#0a1f7a]/90",
    },
    {
      id: "humo" as PaymentMethod,
      logo: "/api/assets/humoLogo",
      number: settings?.humoCard ?? "",
      holder: settings?.humoHolder ?? "",
      gradient: "from-[#F5A623]/90 to-[#E8590C]/90",
    },
  ].filter((c) => c.number);

  const copyCard = (num: string) => {
    navigator.clipboard?.writeText(num.replace(/\s/g, ""));
    haptic.success();
    toast("success", t("copied"), num);
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("warning", t("onlyImage"), t("onlyImageSub"));
      return;
    }
    try {
      const { base64, mime } = await compressImage(f);
      setReceipt({ base64, mime, preview: `data:${mime};base64,${base64}` });
      haptic.success();
    } catch {
      toast("error", t("orderFail"), t("onlyImageSub"));
    }
  };

  const submit = async () => {
    if (!pkg || !method || !receipt) return;
    setSubmitting(true);
    try {
      await api<{ order: OrderRow }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          packageId: pkg.id,
          username,
          comment,
          paymentMethod: method,
          receiptData: receipt.base64,
          receiptMime: receipt.mime,
        }),
      });
      toast("success", t("orderSent"), t("orderSentSub"));
      onCreated();
    } catch (e) {
      toast("error", t("orderFail"), (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={!!pkg}
      onClose={onClose}
      title={step === 1 ? `${t("checkout")} · 1/2` : `${t("payment")} · 2/2`}
    >
      {pkg && (
        <div className="space-y-4">
          {/* Package summary */}
          <div className="glass flex items-center gap-3 rounded-2xl p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--gold-soft)] text-2xl">
              {pkg.emoji}
            </div>
            <div className="flex-1">
              <p className="font-bold">{pkg.title}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                {pkg.type === "stars" && pkg.starsAmount
                  ? `${pkg.starsAmount.toLocaleString()} Stars`
                  : pkg.duration ?? pkg.description.slice(0, 40)}
              </p>
            </div>
            <span className="text-lg font-extrabold tabular-nums">
              {formatPrice(pkg.price, currency)}
            </span>
          </div>

          {step === 1 ? (
            <>
              <Field label={t("username")}>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@username"
                  className={inputCls}
                />
              </Field>
              <Field label={t("tgIdAuto")}>
                <input value={tgId} disabled className={`${inputCls} opacity-60`} />
              </Field>
              <Field label={t("commentOpt")}>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("commentPh")}
                  rows={2}
                  className={inputCls}
                />
              </Field>
              <Button
                onClick={() => {
                  if (!username.trim()) {
                    toast("warning", t("usernameReq"), t("usernameReqSub"));
                    return;
                  }
                  haptic.medium();
                  setStep(2);
                }}
                className="w-full py-4 text-base"
              >
                {t("toPayment")}
              </Button>
            </>
          ) : (
            <>
              {/* Payment method — bank cards */}
              <Field label={t("choosePayment")}>
                <div className="space-y-3">
                  {cards.length === 0 && (
                    <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
                      {t("noCards")}
                    </p>
                  )}
                  {cards.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        haptic.select();
                        setMethod(c.id);
                      }}
                      className={`pressable relative w-full overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-left text-white shadow-xl transition-all ${c.gradient} ${
                        method === c.id
                          ? "ring-2 ring-[var(--gold)] scale-[1.01]"
                          : "opacity-85"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={c.logo}
                          alt={c.id}
                          className="h-8 w-auto max-w-[110px] rounded-lg bg-white/90 object-contain px-1.5 py-1"
                        />
                        {method === c.id && <span className="text-xl">✅</span>}
                      </div>
                      <p className="mt-4 font-mono text-lg font-bold tracking-widest">
                        {c.number}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-wider opacity-80">
                          {c.holder || "CARD HOLDER"}
                        </p>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            copyCard(c.number);
                          }}
                          className="rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold backdrop-blur"
                        >
                          {t("copy")}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </Field>

              {/* Amount to pay */}
              <div className="flex items-center justify-between rounded-2xl bg-[var(--gold-soft)] px-4 py-3">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">
                  {t("payAmount")}
                </span>
                <span className="text-xl font-extrabold tabular-nums">
                  {formatPrice(pkg.price, currency)}
                </span>
              </div>

              {/* Receipt upload */}
              <Field label={t("uploadReceipt")}>
                <label
                  className={`pressable flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed p-5 text-center transition-colors ${
                    receipt
                      ? "border-emerald-400/60 bg-emerald-500/10"
                      : "border-[var(--gold)]/40 bg-transparent hover:bg-[var(--gold-soft)]"
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  />
                  {receipt ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={receipt.preview}
                        alt="Chek"
                        className="max-h-40 rounded-2xl shadow-md"
                      />
                      <span className="text-xs font-semibold text-emerald-500">
                        {t("receiptUploaded")}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl">🧾</span>
                      <span className="text-sm font-semibold">
                        {t("receiptChoose")}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {t("receiptHint")}
                      </span>
                    </>
                  )}
                </label>
              </Field>

              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setStep(1)} className="shrink-0">
                  {t("back")}
                </Button>
                <Button
                  onClick={submit}
                  disabled={submitting || !method || !receipt}
                  className="flex-1 py-4 text-base"
                >
                  {submitting
                    ? t("sending")
                    : !method
                      ? t("selectCard")
                      : !receipt
                        ? t("uploadFirst")
                        : t("confirm")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
