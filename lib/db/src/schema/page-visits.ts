import { pgTable, serial, text, smallint, timestamp, index } from "drizzle-orm/pg-core";

export const pageVisitsTable = pgTable("page_visits", {
  id: serial("id").primaryKey(),
  page: text("page").notNull(),
  referrer: text("referrer"),
  ipHash: text("ip_hash"),
  ip: text("ip"),
  device: text("device"),
  language: text("language"),
  screenWidth: smallint("screen_width"),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("page_visits_visited_at_idx").on(table.visitedAt),
  index("page_visits_page_idx").on(table.page),
  index("page_visits_ip_hash_idx").on(table.ipHash),
  index("page_visits_device_idx").on(table.device),
]);

export type PageVisit = typeof pageVisitsTable.$inferSelect;
