/** Shared client/server types for the store */

export type PackageType = "premium" | "stars" | "gift";

export type OrderStatus =
  | "pending"
  | "waiting_payment"
  | "paid"
  | "processing"
  | "completed"
  | "rejected"
  | "cancelled";

export interface Pkg {
  id: number;
  type: PackageType;
  title: string;
  description: string;
  price: string;
  starsAmount: number | null;
  duration: string | null;
  emoji: string;
  imageUrl: string | null;
  active: boolean;
  available: boolean;
  sortOrder: number;
}

export interface OrderRow {
  id: number;
  userId: number;
  packageId: number | null;
  packageType: PackageType;
  packageTitle: string;
  packageEmoji: string;
  price: string;
  telegramUsername: string;
  telegramId: number;
  comment: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  receiptData?: string | null;
  receiptMime?: string | null;
  adminNote: string | null;
  statusHistory: string;
  createdAt: string;
  updatedAt: string;
  userName?: string | null;
}

export interface UserRow {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  lastActivity: string;
  createdAt: string;
  ordersCount?: number;
  totalSpent?: string;
}

export type PaymentMethod = "visa" | "humo";

export interface StoreSettings {
  storeName: string;
  supportUsername: string;
  telegramChannel: string;
  currency: string;
  maintenanceMode: boolean;
  announcement: string;
  announcementRu: string;
  announcementEn: string;
  requiredChannel: string;
  visaCard: string;
  visaHolder: string;
  humoCard: string;
  humoHolder: string;
  botUsername: string;
}

export interface MeResponse {
  user: UserRow;
  isAdmin: boolean;
  settings: StoreSettings;
  needJoin: boolean;
}

export interface AdminStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  revenue: string;
  usersCount: number;
  todayOrders: number;
  salesByDay: { day: string; orders: number; revenue: number }[];
  statusBreakdown: { status: string; count: number }[];
  recentActivity: {
    id: number;
    action: string;
    details: string;
    createdAt: string;
  }[];
}

export const STATUS_META: Record<
  OrderStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  pending: {
    label: "Pending",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/15",
    dot: "bg-amber-500",
  },
  waiting_payment: {
    label: "Waiting Payment",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/15",
    dot: "bg-sky-500",
  },
  paid: {
    label: "Paid",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/15",
    dot: "bg-violet-500",
  },
  processing: {
    label: "Processing",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/15",
    dot: "bg-blue-500",
  },
  completed: {
    label: "Completed",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/15",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/15",
    dot: "bg-rose-500",
  },
  cancelled: {
    label: "Cancelled",
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-500/15",
    dot: "bg-slate-400",
  },
};

export const ALL_STATUSES = Object.keys(STATUS_META) as OrderStatus[];
