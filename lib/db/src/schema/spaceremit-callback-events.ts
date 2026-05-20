import { pgTable, serial, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Spaceremit server-to-server callback event log.
 * One row per callback delivery for replay protection and audit.
 * The `paymentId` is unique so duplicate deliveries are rejected at the DB level.
 */
export const spaceremitCallbackEventsTable = pgTable("spaceremit_callback_events", {
  id: serial("id").primaryKey(),
  // Spaceremit's unique payment ID (the "id" field in the callback payload).
  paymentId: text("payment_id").notNull(),
  statusTag: text("status_tag"),
  payload: text("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("spaceremit_callback_events_payment_id_uidx").on(table.paymentId),
  index("spaceremit_callback_events_processed_at_idx").on(table.processedAt),
]);

export type SpaceremitCallbackEvent = typeof spaceremitCallbackEventsTable.$inferSelect;
