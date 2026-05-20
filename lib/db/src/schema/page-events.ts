import { pgTable, serial, text, smallint, timestamp, index } from "drizzle-orm/pg-core";

export const pageEventsTable = pgTable("page_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  page: text("page").notNull(),
  element: text("element"),
  value: smallint("value"),
  ipHash: text("ip_hash"),
  device: text("device"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("page_events_created_at_idx").on(table.createdAt),
  index("page_events_event_type_idx").on(table.eventType),
  index("page_events_element_idx").on(table.element),
]);

export type PageEvent = typeof pageEventsTable.$inferSelect;
