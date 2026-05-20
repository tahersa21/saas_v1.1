/**
 * Portal billing routes for Spaceremit.
 *
 * POST /portal/billing/spaceremit/config     — returns public key + limits
 * POST /portal/billing/spaceremit/initiate   — creates a pending intent
 * POST /portal/billing/spaceremit/verify     — verifies payment code, credits account
 * GET  /portal/billing/spaceremit/intents    — lists user's Spaceremit intents
 */
import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, spaceremitPaymentIntentsTable, usersTable, plansTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { getSpaceremitSettings } from "../../lib/spaceremitSettings";
import {
  verifySpaceremitPayment,
  getSpaceremitPublicKey,
  SpaceremitConfigError,
  SpaceremitError,
  ACCEPTED_STATUS_TAGS,
} from "../../lib/spaceremit";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /portal/billing/spaceremit/config
// ─────────────────────────────────────────────────────────────────────────────
router.get("/portal/billing/spaceremit/config", async (req, res): Promise<void> => {
  const userId = req.authUser?.sub ? Number(req.authUser.sub) : null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [settings, publicKey] = await Promise.all([
      getSpaceremitSettings(),
      getSpaceremitPublicKey(),
    ]);

    res.json({
      enabled: settings.enabled,
      mode: settings.mode,
      minTopupUsd: settings.minTopupUsd,
      maxTopupUsd: settings.maxTopupUsd,
      currency: "USD",
      publicKey: settings.enabled ? (publicKey ?? null) : null,
    });
  } catch (err) {
    logger.error({ err }, "Spaceremit config error");
    res.status(500).json({ error: "Failed to load Spaceremit config" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /portal/billing/spaceremit/initiate
// Creates a pending intent and returns the public key + user info for the form.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/portal/billing/spaceremit/initiate", async (req, res): Promise<void> => {
  const userId = req.authUser?.sub ? Number(req.authUser.sub) : null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { amountUsd, purpose = "topup", planId, planName } = req.body as {
    amountUsd?: number;
    purpose?: "topup" | "plan_upgrade";
    planId?: number;
    planName?: string;
  };

  if (!amountUsd || typeof amountUsd !== "number" || amountUsd <= 0) {
    res.status(400).json({ error: "amountUsd must be a positive number" });
    return;
  }

  try {
    const [settings, publicKey, user] = await Promise.all([
      getSpaceremitSettings(),
      getSpaceremitPublicKey(),
      db.select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    ]);

    if (!settings.enabled) {
      res.status(503).json({ error: "Spaceremit payments are currently disabled." });
      return;
    }
    if (!publicKey) {
      res.status(503).json({ error: "Spaceremit is not configured. Please contact support." });
      return;
    }
    if (amountUsd < settings.minTopupUsd || amountUsd > settings.maxTopupUsd) {
      res.status(400).json({
        error: `Amount must be between $${settings.minTopupUsd} and $${settings.maxTopupUsd} USD`,
      });
      return;
    }

    const metadata = JSON.stringify({ purpose, planId, planName });
    const [intent] = await db.insert(spaceremitPaymentIntentsTable).values({
      userId,
      amountUsd,
      status: "pending",
      mode: settings.mode,
      metadata,
    }).returning({ id: spaceremitPaymentIntentsTable.id });

    const userInfo = user[0];
    res.json({
      intentId: intent.id,
      publicKey,
      mode: settings.mode,
      amountUsd,
      currency: "USD",
      userEmail: userInfo?.email ?? "",
      userName: userInfo?.name ?? "",
    });
  } catch (err) {
    logger.error({ err, userId }, "Spaceremit initiate error");
    res.status(500).json({ error: "Failed to initiate Spaceremit payment" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /portal/billing/spaceremit/verify
// Called by the frontend after SP_SUCCESSFUL_PAYMENT fires.
// Verifies the payment with Spaceremit API and credits the account.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/portal/billing/spaceremit/verify", async (req, res): Promise<void> => {
  const userId = req.authUser?.sub ? Number(req.authUser.sub) : null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { intentId, paymentCode } = req.body as { intentId?: number; paymentCode?: string };

  if (!intentId || !paymentCode) {
    res.status(400).json({ error: "intentId and paymentCode are required" });
    return;
  }

  // Load the intent and verify it belongs to this user
  const [intent] = await db
    .select()
    .from(spaceremitPaymentIntentsTable)
    .where(eq(spaceremitPaymentIntentsTable.id, intentId))
    .limit(1);

  if (!intent) { res.status(404).json({ error: "Payment intent not found" }); return; }
  if (intent.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (intent.status === "credited") {
    res.json({ credited: true, alreadyCredited: true, amountUsd: intent.amountUsd });
    return;
  }
  if (intent.status === "failed") {
    res.status(400).json({ error: "This payment intent has failed." });
    return;
  }

  // Verify with Spaceremit API
  let paymentData;
  try {
    paymentData = await verifySpaceremitPayment(paymentCode);
  } catch (err) {
    if (err instanceof SpaceremitConfigError) {
      res.status(503).json({ error: "Payment gateway not configured." });
      return;
    }
    if (err instanceof SpaceremitError) {
      logger.warn({ err, intentId, paymentCode }, "Spaceremit payment verification failed");
      await db.update(spaceremitPaymentIntentsTable)
        .set({ status: "failed", failureReason: err.message, spaceremitPaymentId: paymentCode })
        .where(eq(spaceremitPaymentIntentsTable.id, intentId));
      res.status(400).json({ error: `Payment verification failed: ${err.message}` });
      return;
    }
    logger.error({ err, intentId }, "Spaceremit verify unexpected error");
    res.status(500).json({ error: "Payment verification error" });
    return;
  }

  // Check status is accepted
  if (!ACCEPTED_STATUS_TAGS.has(paymentData.status_tag)) {
    await db.update(spaceremitPaymentIntentsTable)
      .set({
        status: "failed",
        spaceremitPaymentId: paymentData.id,
        statusTag: paymentData.status_tag,
        failureReason: `Payment status: ${paymentData.status}`,
        verifiedAt: new Date(),
      })
      .where(eq(spaceremitPaymentIntentsTable.id, intentId));
    res.status(400).json({ error: `Payment not accepted. Status: ${paymentData.status}` });
    return;
  }

  // Credit the account using CAS to prevent double-crediting
  const amountToCredit = intent.amountUsd;
  const metadata = intent.metadata ? JSON.parse(intent.metadata) as { purpose?: string; planId?: number; planName?: string } : {};
  const now = new Date();

  if (metadata.purpose === "plan_upgrade" && metadata.planId) {
    // Plan upgrade: activate the plan
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [updated] = await db.update(spaceremitPaymentIntentsTable)
      .set({
        status: "credited",
        spaceremitPaymentId: paymentData.id,
        statusTag: paymentData.status_tag,
        verifiedAt: now,
        creditedAt: now,
      })
      .where(
        eq(spaceremitPaymentIntentsTable.id, intentId),
      )
      .returning({ id: spaceremitPaymentIntentsTable.id });

    if (!updated) {
      res.json({ credited: false, alreadyCredited: true });
      return;
    }

    const [plan] = await db.select({ monthlyCredits: plansTable.monthlyCredits })
      .from(plansTable).where(eq(plansTable.id, metadata.planId)).limit(1);

    const userUpdate: Record<string, unknown> = { currentPlanId: metadata.planId, currentPeriodEnd: periodEnd };
    if (plan && plan.monthlyCredits > 0) {
      userUpdate["creditBalance"] = sql`credit_balance + ${plan.monthlyCredits}`;
    }
    await db.update(usersTable).set(userUpdate).where(eq(usersTable.id, userId));

    logger.info({ intentId, userId, planId: metadata.planId }, "Spaceremit plan upgrade activated");
    res.json({ credited: true, purpose: "plan_upgrade", planName: metadata.planName });
  } else {
    // Top-up: credit topupCreditBalance
    const [updated] = await db.update(spaceremitPaymentIntentsTable)
      .set({
        status: "credited",
        spaceremitPaymentId: paymentData.id,
        statusTag: paymentData.status_tag,
        verifiedAt: now,
        creditedAt: now,
      })
      .where(eq(spaceremitPaymentIntentsTable.id, intentId))
      .returning({ id: spaceremitPaymentIntentsTable.id });

    if (!updated) {
      res.json({ credited: false, alreadyCredited: true });
      return;
    }

    await db.update(usersTable)
      .set({ topupCreditBalance: sql`${usersTable.topupCreditBalance} + ${amountToCredit}` })
      .where(eq(usersTable.id, userId));

    logger.info({ intentId, userId, amountUsd: amountToCredit, paymentId: paymentData.id }, "Spaceremit topup credited");
    res.json({ credited: true, purpose: "topup", amountUsd: amountToCredit });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /portal/billing/spaceremit/intents
// ─────────────────────────────────────────────────────────────────────────────
router.get("/portal/billing/spaceremit/intents", async (req, res): Promise<void> => {
  const userId = req.authUser?.sub ? Number(req.authUser.sub) : null;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const intents = await db
    .select()
    .from(spaceremitPaymentIntentsTable)
    .where(eq(spaceremitPaymentIntentsTable.userId, userId))
    .orderBy(desc(spaceremitPaymentIntentsTable.createdAt))
    .limit(50);

  res.json(intents);
});

export default router;
