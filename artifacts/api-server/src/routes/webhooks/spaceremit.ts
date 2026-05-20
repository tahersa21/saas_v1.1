/**
 * POST /webhooks/spaceremit (also /api/webhooks/spaceremit)
 *
 * Handles server-to-server payment callbacks from Spaceremit.
 * Spaceremit sends the same JSON structure as the payment_info response.
 * There is no HMAC signature; authenticity is verified by re-calling the
 * payment_info API with the payment ID and our private key.
 */
import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, spaceremitCallbackEventsTable, spaceremitPaymentIntentsTable, usersTable, plansTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { verifySpaceremitPayment, ACCEPTED_STATUS_TAGS, SpaceremitConfigError } from "../../lib/spaceremit";

const router: IRouter = Router();

router.post(
  "/webhooks/spaceremit",
  async (req, res): Promise<void> => {
    const payload = req.body as {
      response_status?: string;
      data?: {
        id?: string;
        status?: string;
        status_tag?: string;
        total_amount?: string;
        seller_public_key?: string;
      };
    };

    logger.info({
      ip: req.ip,
      hasData: Boolean(payload?.data),
      paymentId: payload?.data?.id,
    }, "Spaceremit callback: incoming request");

    const paymentId = payload?.data?.id;
    if (!paymentId) {
      logger.warn("Spaceremit callback: missing payment ID");
      res.status(400).json({ error: "Missing payment ID" });
      return;
    }

    // Idempotency check: deduplicate by payment ID
    try {
      await db.insert(spaceremitCallbackEventsTable).values({
        paymentId,
        statusTag: payload?.data?.status_tag ?? null,
        payload: JSON.stringify(payload),
      });
    } catch {
      // Unique constraint violation = duplicate callback
      logger.info({ paymentId }, "Spaceremit callback: duplicate ignored");
      res.json({ received: true, duplicate: true });
      return;
    }

    // Re-verify with Spaceremit API for authenticity
    let verified;
    try {
      verified = await verifySpaceremitPayment(paymentId);
    } catch (err) {
      if (err instanceof SpaceremitConfigError) {
        logger.error("Spaceremit callback: private key not configured");
        res.status(500).json({ error: "Gateway not configured" });
        return;
      }
      logger.error({ err, paymentId }, "Spaceremit callback: verification failed");
      res.json({ received: true, verified: false });
      return;
    }

    logger.info({ paymentId, statusTag: verified.status_tag, status: verified.status }, "Spaceremit callback: verified");

    if (!ACCEPTED_STATUS_TAGS.has(verified.status_tag)) {
      res.json({ received: true, status: verified.status_tag, credited: false });
      return;
    }

    // Find matching intent by payment ID
    const [intent] = await db
      .select()
      .from(spaceremitPaymentIntentsTable)
      .where(eq(spaceremitPaymentIntentsTable.spaceremitPaymentId, paymentId))
      .limit(1);

    if (!intent) {
      logger.warn({ paymentId }, "Spaceremit callback: no matching intent (callback arrived before verify)");
      res.json({ received: true, unknown_payment: true });
      return;
    }

    if (intent.status === "credited") {
      res.json({ received: true, already_credited: true });
      return;
    }

    const now = new Date();
    const metadata = intent.metadata ? JSON.parse(intent.metadata) as { purpose?: string; planId?: number; planName?: string } : {};

    if (metadata.purpose === "plan_upgrade" && metadata.planId) {
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const [updated] = await db.update(spaceremitPaymentIntentsTable)
        .set({ status: "credited", statusTag: verified.status_tag, creditedAt: now })
        .where(eq(spaceremitPaymentIntentsTable.id, intent.id))
        .returning({ id: spaceremitPaymentIntentsTable.id });

      if (updated) {
        const [plan] = await db.select({ monthlyCredits: plansTable.monthlyCredits })
          .from(plansTable).where(eq(plansTable.id, metadata.planId)).limit(1);

        const userUpd: Record<string, unknown> = { currentPlanId: metadata.planId, currentPeriodEnd: periodEnd };
        if (plan && plan.monthlyCredits > 0) {
          userUpd["creditBalance"] = sql`credit_balance + ${plan.monthlyCredits}`;
        }
        await db.update(usersTable).set(userUpd).where(eq(usersTable.id, intent.userId));

        logger.info({ intentId: intent.id, planId: metadata.planId }, "Spaceremit callback: plan upgrade activated");
      }
    } else {
      const amountToCredit = intent.amountUsd;
      const [updated] = await db.update(spaceremitPaymentIntentsTable)
        .set({ status: "credited", statusTag: verified.status_tag, creditedAt: now })
        .where(eq(spaceremitPaymentIntentsTable.id, intent.id))
        .returning({ id: spaceremitPaymentIntentsTable.id });

      if (updated) {
        await db.update(usersTable)
          .set({ topupCreditBalance: sql`${usersTable.topupCreditBalance} + ${amountToCredit}` })
          .where(eq(usersTable.id, intent.userId));

        logger.info({ intentId: intent.id, amountUsd: amountToCredit }, "Spaceremit callback: topup credited");
      }
    }

    res.json({ received: true, credited: true });
  }
);

export default router;
