"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, authHeaders, formatPrice, haptic } from "@/lib/telegram";
import type {
  AdminStats,
  OrderRow,
  PackageType,
  Pkg,
  StoreSettings,
  UserRow,
} from "@/lib/types";
import { ALL_STATUSES, STATUS_META, type OrderStatus } from "@/lib/types";
import {
  Button,
  EmptyState,
  Field,
  GlassCard,
  Sheet,
  Skeleton,
  StatCard,
  StatusBadge,
  Toggle,
  inputCls,
  useToast,
} from "@/components/ui";

type Tab = "dashboard" | "packages" | "orders" | "users" | "settings";

const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id: "dashboard", emoji: "📊", label: "Dashboard" },
  { id: "packages", emoji: "📦", label: "Packages" },
  { id: "orders", emoji: "🧾", label: "Orders" },
  { id: "users", emoji: "👥", label: "Users" },
  { id: "settings", emoji: "⚙️", label: "Settings" },
];

export default function AdminPanel({ currency }: { currency: string }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  return (
    <div className="fade-up">
      <h2 className="mb-3 text-xl font-bold">
        Admin <span className="text-gradient">Panel</span>
      </h2>
      {/* Tab bar */}
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              haptic.select();
              setTab(t.id);
            }}
            className={`pressable flex shrink-0 items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${
              tab === t.id
                ? "gradient-animate bg-gradient-to-r from-[#b98a2e] to-[#dcb15f] text-white shadow-lg shadow-[#b98a2e]/20"
                : "glass text-[var(--text-secondary)]"
            }`}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard currency={currency} />}
      {tab === "packages" && <PackagesTab currency={currency} />}
      {tab === "orders" && <OrdersTab currency={currency} />}
      {tab === "users" && <UsersTab currency={currency} />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

/* ================= Dashboard ================= */

function Dashboard({ currency }: { currency: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);

  const load = useCallback(() => {
    api<AdminStats>("/api/admin/stats").then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000); // realtime-ish dashboard
    return () => clearInterval(t);
  }, [load]);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const maxOrders = Math.max(1, ...stats.salesByDay.map((d) => d.orders));
  const maxRevenue = Math.max(1, ...stats.salesByDay.map((d) => d.revenue));
  const totalStatus = Math.max(
    1,
    stats.statusBreakdown.reduce((a, b) => a + b.count, 0)
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Total Orders" value={stats.totalOrders} emoji="🧾" accent="bg-[var(--gold-soft)]" />
        <StatCard label="Pending" value={stats.pendingOrders} emoji="⏳" accent="bg-amber-500/15" />
        <StatCard label="Completed" value={stats.completedOrders} emoji="✅" accent="bg-emerald-500/15" />
        <StatCard label="Revenue" value={formatPrice(stats.revenue, currency)} emoji="💰" accent="bg-violet-500/15" />
        <StatCard label="Users" value={stats.usersCount} emoji="👥" accent="bg-pink-500/15" />
        <StatCard label="Today" value={stats.todayOrders} emoji="📅" accent="bg-blue-500/15" />
      </div>

      {/* Sales / revenue chart */}
      <GlassCard className="p-5">
        <p className="mb-4 text-sm font-bold">Sales & Revenue — last 14 days</p>
        {stats.salesByDay.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-secondary)]">
            No sales data yet
          </p>
        ) : (
          <div className="flex h-36 items-end gap-1.5">
            {stats.salesByDay.map((d) => (
              <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 rounded-t-md bg-gradient-to-t from-[#b98a2e] to-[#e6c67c] transition-all duration-500"
                    style={{ height: `${(d.orders / maxOrders) * 100}%`, minHeight: 3 }}
                    title={`${d.orders} orders`}
                  />
                  <div
                    className="w-1/2 rounded-t-md bg-gradient-to-t from-violet-500 to-fuchsia-300 transition-all duration-500"
                    style={{ height: `${(d.revenue / maxRevenue) * 100}%`, minHeight: 3 }}
                    title={`${formatPrice(d.revenue, currency)}`}
                  />
                </div>
                <span className="rotate-0 text-[9px] text-[var(--text-secondary)]">
                  {d.day.split(" ")[1]}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-4 text-[11px] text-[var(--text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--gold)]" /> Orders
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-400" /> Revenue
          </span>
        </div>
      </GlassCard>

      {/* Status breakdown */}
      <GlassCard className="p-5">
        <p className="mb-3 text-sm font-bold">Orders by status</p>
        <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-400/15">
          {stats.statusBreakdown.map((s) => (
            <div
              key={s.status}
              className={`${STATUS_META[s.status as OrderStatus]?.dot ?? "bg-slate-400"} transition-all duration-700`}
              style={{ width: `${(s.count / totalStatus) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {stats.statusBreakdown.map((s) => (
            <span
              key={s.status}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_META[s.status as OrderStatus]?.bg} ${STATUS_META[s.status as OrderStatus]?.color}`}
            >
              {STATUS_META[s.status as OrderStatus]?.label ?? s.status}: {s.count}
            </span>
          ))}
        </div>
      </GlassCard>

      {/* Recent activity */}
      <GlassCard className="p-5">
        <p className="mb-3 text-sm font-bold">Recent activity</p>
        {stats.recentActivity.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-secondary)]">
            No activity yet
          </p>
        ) : (
          <div className="space-y-2.5">
            {stats.recentActivity.map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--gold)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.details}</p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {a.action} · {new Date(a.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

/* ================= Packages ================= */

const TYPE_META: Record<PackageType, { label: string; emoji: string }> = {
  premium: { label: "Premium", emoji: "💎" },
  stars: { label: "Stars", emoji: "⭐" },
  gift: { label: "Gifts", emoji: "🎁" },
};

const emptyPkg = (type: PackageType): Partial<Pkg> => ({
  type,
  title: "",
  description: "",
  price: "",
  starsAmount: null,
  duration: null,
  emoji: TYPE_META[type].emoji,
  imageUrl: null,
  active: true,
  available: true,
  sortOrder: 0,
});

function PackagesTab({ currency }: { currency: string }) {
  const { toast } = useToast();
  const [pkgType, setPkgType] = useState<PackageType>("premium");
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [editing, setEditing] = useState<Partial<Pkg> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ packages: Pkg[] }>("/api/admin/packages")
      .then((r) => setPkgs(r.packages))
      .catch(() => setPkgs([]));
  }, []);
  useEffect(load, [load]);

  const list = (pkgs ?? []).filter((p) => p.type === pkgType);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const method = editing.id ? "PATCH" : "POST";
      await api("/api/admin/packages", {
        method,
        body: JSON.stringify(editing),
      });
      toast("success", editing.id ? "Package updated" : "Package created");
      setEditing(null);
      load();
    } catch (e) {
      toast("error", "Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api(`/api/admin/packages?id=${id}`, { method: "DELETE" });
      toast("success", "Package deleted");
      load();
    } catch (e) {
      toast("error", "Delete failed", (e as Error).message);
    }
  };

  const toggleActive = async (p: Pkg) => {
    try {
      await api("/api/admin/packages", {
        method: "PATCH",
        body: JSON.stringify({ ...p, active: !p.active }),
      });
      load();
    } catch (e) {
      toast("error", "Update failed", (e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {(Object.keys(TYPE_META) as PackageType[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                haptic.select();
                setPkgType(t);
              }}
              className={`pressable shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold ${
                pkgType === t
                  ? "glass text-[var(--gold)] ring-1 ring-[var(--gold)]/50"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {TYPE_META[t].emoji} {TYPE_META[t].label}
            </button>
          ))}
        </div>
        <Button onClick={() => setEditing(emptyPkg(pkgType))} className="shrink-0 !px-4 !py-2">
          + New
        </Button>
      </div>

      {pkgs === null ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          emoji={TYPE_META[pkgType].emoji}
          title={`No ${TYPE_META[pkgType].label} packages`}
          subtitle="Create your first package with the + New button."
        />
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <GlassCard key={p.id} className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#d8ac54]/20 to-[#b98a2e]/20 text-xl">
                  {p.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {p.title}{" "}
                    <span className="font-normal text-[var(--text-secondary)]">
                      · {formatPrice(p.price, currency)}
                      {p.starsAmount ? ` · ${p.starsAmount}⭐` : ""}
                      {p.duration ? ` · ${p.duration}` : ""}
                    </span>
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    sort {p.sortOrder} · {p.available ? "available" : "sold out"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Toggle checked={p.active} onChange={() => toggleActive(p)} />
                  <button
                    onClick={() => {
                      haptic.light();
                      setEditing(p);
                    }}
                    className="pressable glass shrink-0 rounded-xl px-3 py-2 text-xs font-semibold"
                  >
                    ✏️ Tahrirlash
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="pressable shrink-0 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-500"
                    title="O'chirish"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Editor sheet */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit package" : `New ${TYPE_META[pkgType].label} package`}
      >
        {editing && (
          <div className="space-y-3">
            <Field label="Title">
              <input
                className={inputCls}
                value={editing.title ?? ""}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="e.g. 3 Months Premium"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Price (${currency})`}>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.price ?? ""}
                  onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                  placeholder="9.99"
                />
              </Field>
              <Field label="Emoji">
                <input
                  className={inputCls}
                  value={editing.emoji ?? ""}
                  onChange={(e) => setEditing({ ...editing, emoji: e.target.value })}
                />
              </Field>
            </div>
            {editing.type === "stars" && (
              <Field label="Stars amount">
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={editing.starsAmount ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      starsAmount: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  placeholder="500"
                />
              </Field>
            )}
            {editing.type === "premium" && (
              <Field label="Duration">
                <input
                  className={inputCls}
                  value={editing.duration ?? ""}
                  onChange={(e) => setEditing({ ...editing, duration: e.target.value })}
                  placeholder="3 Months"
                />
              </Field>
            )}
            <Field label="Description">
              <textarea
                className={inputCls}
                rows={2}
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
            <Field label="Image URL (optional)">
              <input
                className={inputCls}
                value={editing.imageUrl ?? ""}
                onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value || null })}
                placeholder="https://…"
              />
            </Field>
            <div className="grid grid-cols-3 items-center gap-3">
              <Field label="Sort order">
                <input
                  className={inputCls}
                  type="number"
                  value={editing.sortOrder ?? 0}
                  onChange={(e) =>
                    setEditing({ ...editing, sortOrder: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </Field>
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Active</span>
                <Toggle
                  checked={editing.active !== false}
                  onChange={(v) => setEditing({ ...editing, active: v })}
                />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Available</span>
                <Toggle
                  checked={editing.available !== false}
                  onChange={(v) => setEditing({ ...editing, available: v })}
                />
              </div>
            </div>
            <Button onClick={save} disabled={saving} className="w-full py-3.5">
              {saving ? "Saving…" : editing.id ? "Save changes" : "Create package"}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ================= Orders ================= */

function OrdersTab({ currency }: { currency: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    api<{ orders: OrderRow[] }>(`/api/admin/orders?${params}`)
      .then((r) => setRows(r.orders))
      .catch(() => setRows([]));
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // realtime order updates
  useEffect(() => {
    const t = setInterval(load, 12_000);
    return () => clearInterval(t);
  }, [load]);

  const toggleSel = (id: number) => {
    haptic.select();
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const bulkStatus = async (ids: number[], newStatus: OrderStatus) => {
    try {
      await api("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({ ids, status: newStatus }),
      });
      toast("success", `Updated ${ids.length} order(s)`, STATUS_META[newStatus].label);
      setSelected(new Set());
      setDetail(null);
      load();
    } catch (e) {
      toast("error", "Update failed", (e as Error).message);
    }
  };

  const bulkDelete = async (ids: number[]) => {
    try {
      await api(`/api/admin/orders?ids=${ids.join(",")}`, { method: "DELETE" });
      toast("success", `Deleted ${ids.length} order(s)`);
      setSelected(new Set());
      setDetail(null);
      load();
    } catch (e) {
      toast("error", "Delete failed", (e as Error).message);
    }
  };

  const saveNote = async () => {
    if (!detail) return;
    try {
      await api("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({ ids: [detail.id], adminNote: note }),
      });
      toast("success", "Note saved");
      load();
    } catch (e) {
      toast("error", "Save failed", (e as Error).message);
    }
  };

  const exportCsv = async () => {
    const res = await fetch("/api/admin/orders?export=csv", { headers: authHeaders() });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast("success", "CSV exported");
  };

  const history = useMemo(() => {
    if (!detail) return [];
    try {
      return JSON.parse(detail.statusHistory) as {
        status: string;
        at: string;
        by: string;
      }[];
    } catch {
      return [];
    }
  }, [detail]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search id, package, @username…"
          className={inputCls}
        />
        <Button variant="secondary" onClick={exportCsv} className="shrink-0 !px-4">
          ⬇ CSV
        </Button>
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={status === ""} label="All" onClick={() => setStatus("")} />
        {ALL_STATUSES.map((s) => (
          <FilterChip
            key={s}
            active={status === s}
            label={STATUS_META[s].label}
            onClick={() => setStatus(s)}
          />
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="pop-in glass-strong sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl p-3">
          <span className="text-xs font-bold">{selected.size} selected</span>
          <select
            className="glass rounded-xl px-2 py-1.5 text-xs font-semibold outline-none"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value)
                bulkStatus([...selected], e.target.value as OrderStatus);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Set status…
            </option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
          <button
            onClick={() => bulkDelete([...selected])}
            className="pressable rounded-xl bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-500"
          >
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-[var(--text-secondary)]"
          >
            Clear
          </button>
        </div>
      )}

      {rows === null ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState emoji="🧾" title="No orders found" subtitle="Try adjusting search or filters." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((o) => (
            <GlassCard key={o.id} className="p-3.5">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggleSel(o.id)}
                  className="h-4.5 w-4.5 shrink-0 accent-[#b98a2e]"
                />
                <button
                  onClick={() => {
                    haptic.light();
                    setDetail(o);
                    setNote(o.adminNote ?? "");
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#d8ac54]/20 to-[#b98a2e]/20 text-lg">
                    {o.packageEmoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      #{o.id} · {o.packageTitle}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-secondary)]">
                      {o.telegramUsername} · {new Date(o.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-extrabold tabular-nums">
                      {formatPrice(o.price, currency)}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Order detail sheet */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail ? `Order #${detail.id}` : ""}>
        {detail && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-4 text-sm">
              <p className="font-bold">
                {detail.packageEmoji} {detail.packageTitle} —{" "}
                {formatPrice(detail.price, currency)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {detail.telegramUsername} · TG ID {detail.telegramId}
                {detail.userName ? ` · ${detail.userName}` : ""}
                {detail.paymentMethod && (
                  <span className="ml-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-500">
                    {detail.paymentMethod}
                  </span>
                )}
              </p>
              {detail.comment && (
                <p className="mt-2 rounded-xl bg-[var(--gold-soft)] px-3 py-2 text-xs">
                  💬 {detail.comment}
                </p>
              )}
            </div>

            {(detail as OrderRow & { hasReceipt?: boolean }).hasReceipt && (
              <ReceiptViewer orderId={detail.id} />
            )}

            <Field label="Change status">
              <div className="flex flex-wrap gap-2">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => bulkStatus([detail.id], s)}
                    className={`pressable rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                      detail.status === s
                        ? `${STATUS_META[s].bg} ${STATUS_META[s].color} ring-1 ring-current`
                        : "glass text-[var(--text-secondary)]"
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Admin note (visible to user)">
              <textarea
                className={inputCls}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button onClick={saveNote} className="flex-1">
                Save note
              </Button>
              <Button variant="danger" onClick={() => bulkDelete([detail.id])}>
                Delete
              </Button>
            </div>

            {history.length > 0 && (
              <Field label="Status history">
                <div className="space-y-2">
                  {history
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span
                          className={`h-2 w-2 rounded-full ${STATUS_META[h.status as OrderStatus]?.dot ?? "bg-slate-400"}`}
                        />
                        <span className="font-semibold">
                          {STATUS_META[h.status as OrderStatus]?.label ?? h.status}
                        </span>
                        <span className="text-[var(--text-secondary)]">
                          {new Date(h.at).toLocaleString()} · {h.by}
                        </span>
                      </div>
                    ))}
                </div>
              </Field>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** Lazily loads the payment receipt image with auth headers */
function ReceiptViewer({ orderId }: { orderId: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    fetch(`/api/receipts/${orderId}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b) {
          url = URL.createObjectURL(b);
          setSrc(url);
        }
      })
      .catch(() => {});
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [orderId]);

  return (
    <Field label="To'lov cheki">
      {src ? (
        <button
          onClick={() => {
            haptic.light();
            setOpen(!open);
          }}
          className="pressable block w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Payment receipt"
            className={`w-full rounded-2xl shadow-md transition-all ${open ? "" : "max-h-44 object-cover object-top"}`}
          />
          <span className="mt-1 block text-center text-[11px] text-[var(--text-secondary)]">
            {open ? "Kichraytirish" : "To'liq ko'rish uchun bosing"}
          </span>
        </button>
      ) : (
        <Skeleton className="h-32" />
      )}
    </Field>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => {
        haptic.select();
        onClick();
      }}
      className={`pressable shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "bg-gradient-to-r from-[#b98a2e] to-[#dcb15f] text-white shadow-md shadow-[#b98a2e]/20"
          : "glass text-[var(--text-secondary)]"
      }`}
    >
      {label}
    </button>
  );
}

/* ================= Users ================= */

function UsersTab({ currency }: { currency: string }) {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ users: UserRow[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`)
        .then((r) => setRows(r.users))
        .catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search users…"
        className={inputCls}
      />
      {rows === null ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState emoji="👥" title="No users found" />
      ) : (
        <div className="space-y-2.5">
          {rows.map((u) => (
            <GlassCard key={u.id} className="flex items-center gap-3 p-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#d8ac54] to-[#a87b24] text-sm font-bold text-white">
                {(u.firstName ?? u.username ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                  {u.username && (
                    <span className="font-normal text-[var(--gold)]"> @{u.username}</span>
                  )}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  ID {u.telegramId} · active {new Date(u.lastActivity).toLocaleDateString()}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-extrabold tabular-nums">
                  {formatPrice(u.totalSpent ?? "0", currency)}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {u.ordersCount ?? 0} orders
                </p>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Logo uploader ================= */

/** Read a file, downscale (max 512px, PNG keeps transparency) and return base64 */
async function fileToAsset(
  file: File
): Promise<{ data: string; mime: string }> {
  // Keep SVG untouched
  if (file.type === "image/svg+xml") {
    const buf = await file.arrayBuffer();
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { data: btoa(bin), mime: "image/svg+xml" };
  }
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
  const scale = Math.min(1, 512 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  const out = keepAlpha
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.88);
  return {
    data: out.split(",")[1],
    mime: keepAlpha ? "image/png" : "image/jpeg",
  };
}

function LogoUploader({
  assetKey,
  label,
  fallbackEmoji = "🖼",
}: {
  assetKey: string;
  label: string;
  fallbackEmoji?: string;
}) {
  const { toast } = useToast();
  const [v, setV] = useState(0); // cache-buster
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);

  const upload = async (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast("warning", "Faqat rasm", "PNG, JPG, WEBP yoki SVG yuklang.");
      return;
    }
    setBusy(true);
    try {
      const { data, mime } = await fileToAsset(f);
      await api("/api/admin/upload", {
        method: "POST",
        body: JSON.stringify({ key: assetKey, data, mime }),
      });
      setMissing(false);
      setV(Date.now());
      haptic.success();
      toast("success", `${label} yangilandi`);
    } catch (e) {
      toast("error", "Yuklash xatosi", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    try {
      await api(`/api/admin/upload?key=${assetKey}`, { method: "DELETE" });
      setMissing(false);
      setV(Date.now());
      toast("success", `${label} standart holatga qaytdi`);
    } catch (e) {
      toast("error", "Xatolik", (e as Error).message);
    }
  };

  return (
    <div className="glass flex flex-col items-center gap-2 rounded-2xl p-3">
      <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-xl bg-white/60 p-2 dark:bg-white/10">
        {missing ? (
          <span className="text-3xl">{fallbackEmoji}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/assets/${assetKey}?v=${v}`}
            alt={label}
            onError={() => setMissing(true)}
            className="max-h-12 max-w-full object-contain"
          />
        )}
      </div>
      <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
        {label}
      </p>
      <div className="flex w-full gap-1.5">
        <label className="pressable flex-1 cursor-pointer rounded-xl bg-gradient-to-r from-[#b98a2e] to-[#dcb15f] px-2 py-1.5 text-center text-[11px] font-bold text-white">
          {busy ? "…" : "📂 Yuklash"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0] ?? null)}
          />
        </label>
        <button
          onClick={reset}
          className="pressable rounded-xl bg-slate-500/15 px-2 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"
          title="Standartga qaytarish"
        >
          ↺
        </button>
      </div>
    </div>
  );
}

/* ================= Settings ================= */

function SettingsTab() {
  const { toast } = useToast();
  const [s, setS] = useState<StoreSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [botBusy, setBotBusy] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [botTokenSet, setBotTokenSet] = useState(false);

  useEffect(() => {
    api<{
      settings: StoreSettings;
      botTokenSet?: boolean;
      botTokenMasked?: string;
    }>("/api/admin/settings")
      .then((r) => {
        setS(r.settings);
        setBotTokenSet(!!r.botTokenSet);
        setBotToken(r.botTokenMasked ?? "");
      })
      .catch(() => {});
  }, []);

  const connectBot = async () => {
    setBotBusy(true);
    try {
      // Save the token first if the admin typed a new (unmasked) one
      if (botToken && !botToken.includes("•")) {
        const r0 = await api<{ botTokenSet?: boolean; botTokenMasked?: string }>(
          "/api/admin/settings",
          { method: "PUT", body: JSON.stringify({ botToken }) }
        );
        setBotTokenSet(!!r0.botTokenSet);
        setBotToken(r0.botTokenMasked ?? "");
      }
      const r = await api<{
        ok: boolean;
        bot?: { username: string };
        mode?: string;
      }>("/api/bot/setup", { method: "POST" });
      if (r.ok) {
        toast(
          "success",
          `Bot ulandi: @${r.bot?.username}`,
          "Bot ishga tushdi — /start yozib tekshiring."
        );
        if (r.bot?.username && s) setS({ ...s, botUsername: `@${r.bot.username}` });
      } else {
        toast("error", "Webhook o'rnatilmadi", "Bot tokenini tekshiring.");
      }
    } catch (e) {
      toast("error", "Bot ulanmadi", (e as Error).message);
    } finally {
      setBotBusy(false);
    }
  };

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(s) });
      toast("success", "Settings saved", "Changes are live for all users.");
    } catch (e) {
      toast("error", "Save failed", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!s) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  return (
    <GlassCard className="space-y-4 p-5">
      <Field label="Store name">
        <input className={inputCls} value={s.storeName} onChange={(e) => setS({ ...s, storeName: e.target.value })} />
      </Field>
      <Field label="Support username">
        <input className={inputCls} value={s.supportUsername} onChange={(e) => setS({ ...s, supportUsername: e.target.value })} />
      </Field>
      <Field label="Telegram channel">
        <input className={inputCls} value={s.telegramChannel} onChange={(e) => setS({ ...s, telegramChannel: e.target.value })} />
      </Field>
      <Field label="Currency">
        <input className={inputCls} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })} />
      </Field>
      {/* Localized announcement banner */}
      <div className="rounded-2xl bg-[var(--gold-soft)] p-4 ring-1 ring-[var(--gold)]/25">
        <p className="mb-3 text-sm font-bold">📢 E&apos;lon banneri (tilga qarab ko&apos;rinadi, bo&apos;sh = yashirin)</p>
        <div className="space-y-3">
          <Field label="🇺🇿 O'zbekcha e'lon">
            <textarea className={inputCls} rows={2} value={s.announcement} onChange={(e) => setS({ ...s, announcement: e.target.value })} />
          </Field>
          <Field label="🇷🇺 Ruscha e'lon">
            <textarea className={inputCls} rows={2} value={s.announcementRu} onChange={(e) => setS({ ...s, announcementRu: e.target.value })} />
          </Field>
          <Field label="🇬🇧 Inglizcha e'lon">
            <textarea className={inputCls} rows={2} value={s.announcementEn} onChange={(e) => setS({ ...s, announcementEn: e.target.value })} />
          </Field>
        </div>
      </div>

      {/* Mandatory channel */}
      <Field label="Majburiy a'zolik kanali (masalan @kanalim, bo'sh = o'chiq)">
        <input
          className={inputCls}
          value={s.requiredChannel}
          onChange={(e) => setS({ ...s, requiredChannel: e.target.value })}
          placeholder="@channel_username"
        />
      </Field>
      <p className="-mt-2 text-[11px] text-[var(--text-secondary)]">
        ⚠️ Bot ushbu kanalda admin bo&apos;lishi shart — aks holda a&apos;zolik
        tekshirilmaydi.
      </p>

      {/* Payment cards */}
      <div className="rounded-2xl bg-blue-500/5 p-4 ring-1 ring-blue-400/20">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold">
          💳 To&apos;lov kartalari
        </p>
        <div className="space-y-3">
          <Field label="VISA karta raqami">
            <input
              className={inputCls}
              value={s.visaCard}
              onChange={(e) => setS({ ...s, visaCard: e.target.value })}
              placeholder="4111 1111 1111 1111"
            />
          </Field>
          <Field label="VISA karta egasi">
            <input
              className={inputCls}
              value={s.visaHolder}
              onChange={(e) => setS({ ...s, visaHolder: e.target.value })}
              placeholder="MUSO ROZAQOV"
            />
          </Field>
          <Field label="HUMO karta raqami">
            <input
              className={inputCls}
              value={s.humoCard}
              onChange={(e) => setS({ ...s, humoCard: e.target.value })}
              placeholder="9860 0000 0000 0000"
            />
          </Field>
          <Field label="HUMO karta egasi">
            <input
              className={inputCls}
              value={s.humoHolder}
              onChange={(e) => setS({ ...s, humoHolder: e.target.value })}
              placeholder="MUSO ROZAQOV"
            />
          </Field>
        </div>
      </div>

      {/* Brand logos */}
      <div className="rounded-2xl bg-violet-500/5 p-4 ring-1 ring-violet-400/20">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold">
          🖼 Logotiplar (fayldan yuklash)
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LogoUploader assetKey="storeLogo" label="Do'kon logosi" fallbackEmoji="🏪" />
          <LogoUploader assetKey="visaLogo" label="VISA logosi" fallbackEmoji="💳" />
          <LogoUploader assetKey="humoLogo" label="HUMO logosi" fallbackEmoji="💳" />
        </div>
        <p className="mb-3 mt-4 text-sm font-bold">🧭 Navigatsiya ikonkalari</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LogoUploader assetKey="navHome" label="Asosiy (🏠)" fallbackEmoji="🏠" />
          <LogoUploader assetKey="navOrders" label="Buyurtmalar (📦)" fallbackEmoji="📦" />
          <LogoUploader assetKey="navAdmin" label="Admin (🛠️)" fallbackEmoji="🛠️" />
        </div>
        <p className="mb-3 mt-4 text-sm font-bold">🛍 Bosh sahifa kartalari logolari</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LogoUploader assetKey="catStars" label="Stars kartasi (⭐)" fallbackEmoji="⭐" />
          <LogoUploader assetKey="catPremium" label="Premium kartasi (💎)" fallbackEmoji="💎" />
          <LogoUploader assetKey="catGift" label="Gifts kartasi (🎁)" fallbackEmoji="🎁" />
        </div>
      </div>

      {/* Bot connection */}
      <div className="rounded-2xl bg-[var(--gold-soft)] p-4">
        <p className="text-sm font-bold">
          🤖 Telegram bot{" "}
          {s.botUsername && (
            <span className="text-[var(--gold)]">{s.botUsername}</span>
          )}{" "}
          {botTokenSet ? (
            <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
              TOKEN ✓
            </span>
          ) : (
            <span className="ml-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500">
              TOKEN YO&apos;Q
            </span>
          )}
        </p>
        <p className="mb-3 mt-1 text-xs text-[var(--text-secondary)]">
          @BotFather dan olingan tokenni kiriting va «Ulash» tugmasini bosing —
          webhook o&apos;rnatiladi va bot ishga tushadi.
        </p>
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1 font-mono text-xs`}
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder="123456789:AAF...bot tokeni"
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            variant="secondary"
            onClick={connectBot}
            disabled={botBusy}
            className="shrink-0 !px-4 !py-2"
          >
            {botBusy ? "Ulanmoqda…" : "🚀 Ulash"}
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-amber-500/10 px-4 py-3">
        <div>
          <p className="text-sm font-bold">Maintenance mode</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Hides the store for everyone except admins
          </p>
        </div>
        <Toggle checked={s.maintenanceMode} onChange={(v) => setS({ ...s, maintenanceMode: v })} />
      </div>
      <Button onClick={save} disabled={saving} className="w-full py-3.5">
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </GlassCard>
  );
}
