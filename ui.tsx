"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { haptic } from "@/lib/telegram";
import { STATUS_META, type OrderStatus } from "@/lib/types";

/* ================= Glass Card ================= */

export function GlassCard({
  children,
  className = "",
  onClick,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`glass rounded-2xl ${hover ? "card-hover cursor-pointer" : ""} ${
        onClick ? "pressable cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ================= Buttons ================= */

export function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "btn-lux",
    secondary:
      "glass text-[var(--text-primary)] hover:border-[var(--hairline-strong)]",
    danger:
      "text-rose-50 bg-rose-700/90 border border-rose-900/40 shadow-md",
    ghost: "text-[var(--gold)] hover:bg-[var(--gold-soft)]",
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={() => {
        haptic.light();
        onClick?.();
      }}
      className={`pressable rounded-xl px-5 py-3 text-sm font-bold tracking-tight transition-all disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/* ================= Inputs ================= */

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl glass px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]/60 focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)]/50 transition-all";

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      translate="no"
      onClick={() => {
        haptic.select();
        onChange(!checked);
      }}
      className={`notranslate relative box-content inline-flex h-7 w-12 shrink-0 cursor-pointer items-center overflow-hidden rounded-full border-0 p-0 align-middle transition-colors duration-300 ${
        checked ? "bg-[var(--gold)]" : "bg-slate-400/40"
      }`}
      style={{ minWidth: 48, maxWidth: 48 }}
    >
      <span
        aria-hidden
        className="pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

/* ================= Status badge ================= */

export function StatusBadge({
  status,
  label,
}: {
  status: OrderStatus;
  label?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.bg} ${meta.color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} dot-pulse`} />
      {label ?? meta.label}
    </span>
  );
}

/* ================= Skeleton ================= */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-2xl ${className}`} />;
}

/* ================= Empty state ================= */

export function EmptyState({
  emoji,
  title,
  subtitle,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="fade-up flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full glass text-4xl">
        {emoji}
      </div>
      <p className="text-base font-semibold">{title}</p>
      {subtitle && (
        <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/* ================= Bottom sheet ================= */

export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="sheet-up glass-strong relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] p-6 sm:max-w-lg sm:rounded-[2rem] sm:pb-6"
        style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-400/40 sm:hidden" />
        {title && <h3 className="mb-4 text-lg font-bold">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

/* ================= Toast system ================= */

export type ToastType = "success" | "error" | "warning" | "info";
interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

const ToastCtx = createContext<{
  toast: (type: ToastType, title: string, message?: string) => void;
}>({ toast: () => {} });

export const useToast = () => useContext(ToastCtx);

const TOAST_META: Record<ToastType, { icon: string; ring: string }> = {
  success: { icon: "✅", ring: "ring-emerald-400/50" },
  error: { icon: "❌", ring: "ring-rose-400/50" },
  warning: { icon: "⚠️", ring: "ring-amber-400/50" },
  info: { icon: "💬", ring: "ring-[var(--gold)]/50" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(
    (type: ToastType, title: string, message?: string) => {
      if (type === "success") haptic.success();
      else if (type === "error") haptic.error();
      else haptic.light();
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, type, title, message }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    },
    []
  );

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in glass-strong pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl p-3.5 ring-1 ${TOAST_META[t.type].ring}`}
          >
            <span className="text-xl">{TOAST_META[t.type].icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              {t.message && (
                <p className="truncate text-xs text-[var(--text-secondary)]">
                  {t.message}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ================= Stat card ================= */

export function StatCard({
  label,
  value,
  emoji,
  accent,
}: {
  label: string;
  value: string | number;
  emoji: string;
  accent: string;
}) {
  return (
    <GlassCard className="fade-up p-4">
      <div
        className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-lg ${accent}`}
      >
        {emoji}
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
    </GlassCard>
  );
}

/* ================= Avatar ================= */

export function Avatar({
  name,
  photoUrl,
  size = 48,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-white/50"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-[var(--ink)] font-bold text-[#e6c67c] ring-1 ring-[var(--gold)]/60 dark:bg-[var(--gold)] dark:text-[#17130a]"
      style={{ width: size, height: size, fontSize: size / 2.6 }}
    >
      {initials || "?"}
    </div>
  );
}
