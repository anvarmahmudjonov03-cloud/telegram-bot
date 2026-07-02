import {
  pgTable,
  serial,
  text,
  bigint,
  boolean,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";

/** Telegram users (auto-registered from initData) */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  photoUrl: text("photo_url"),
  lastActivity: timestamp("last_activity").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Unified catalog for premium / stars / gift packages */
export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'premium' | 'stars' | 'gift'
  title: text("title").notNull(),
  description: text("description").default("").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  starsAmount: integer("stars_amount"), // only for stars packages
  duration: text("duration"), // only for premium packages e.g. "3 Months"
  emoji: text("emoji").default("⭐").notNull(),
  imageUrl: text("image_url"),
  active: boolean("active").default(true).notNull(),
  available: boolean("available").default(true).notNull(), // gift availability
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Orders with full status lifecycle */
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  packageId: integer("package_id").references(() => packages.id, {
    onDelete: "set null",
  }),
  packageType: text("package_type").notNull(),
  packageTitle: text("package_title").notNull(),
  packageEmoji: text("package_emoji").default("⭐").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  telegramUsername: text("telegram_username").notNull(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  comment: text("comment"),
  status: text("status").default("pending").notNull(),
  paymentMethod: text("payment_method"), // 'visa' | 'humo'
  receiptData: text("receipt_data"), // base64 image of payment receipt
  receiptMime: text("receipt_mime"),
  // pending | waiting_payment | paid | processing | completed | rejected | cancelled
  adminNote: text("admin_note"),
  statusHistory: text("status_history").default("[]").notNull(), // JSON array
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Key/value store settings */
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").default("").notNull(),
});

/** Extra admins managed at runtime (merged with ADMIN_IDS env) */
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

/** In-app notifications shown to users */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  type: text("type").default("info").notNull(), // success | error | warning | info
  title: text("title").notNull(),
  message: text("message").default("").notNull(),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Audit trail of admin / system actions */
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  actorTelegramId: bigint("actor_telegram_id", { mode: "number" }),
  action: text("action").notNull(),
  details: text("details").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
