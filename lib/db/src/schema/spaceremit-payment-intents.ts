import { pgTable, serial, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Spaceremit payment intents.
 *
 * Lifecycle: pending → verified → credited (or failed).
 * A "pending" intent is created when the user initiates payment.
 * After SP_SUCCESSFUL_PAYMENT fires on the client, the frontend
 * calls /portal/billing/spaceremit/verify which sets status=verified,
 * then immediately credits the account and sets status=credited.
 */
export const spaceremitPaymentIntentsTable = pgTable("spaceremit_payment_intents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // The SP... payment ID returned by Spaceremit (set after verification).
  spaceremitPaymentId: text("spaceremit_payment_id"),
  amountUsd: numeric("amount_usd", { precision: 18, scale: 8, mode: "number" }).notNull(),
  // pending | verified | credited | failed
  status: text("status").notNull().default("pending"),
  // test | live
  mode: text("mode").notNull().default("test"),
  // Spaceremit status tag: A=Completed, B=Pending, D=HoldingTime, E=Review, T=Test
  statusTag: text("status_tag"),
  // JSON string: { purpose: "topup" | "plan_upgrade", planId?, planName? }
  metadata: text("metadata"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  creditedAt: timestamp("credited_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("spaceremit_payment_intents_user_id_idx").on(table.userId),
  index("spaceremit_payment_intents_status_idx").on(table.status),
  index("spaceremit_payment_intents_created_at_idx").on(table.createdAt),
  index("spaceremit_payment_intents_payment_id_idx").on(table.spaceremitPaymentId),
]);

export type SpaceremitPaymentIntent = typeof spaceremitPaymentIntentsTable.$inferSelect;
export type InsertSpaceremitPaymentIntent = typeof spaceremitPaymentIntentsTable.$inferInsert;
