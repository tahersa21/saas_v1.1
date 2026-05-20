import { Router, type IRouter } from "express";
import { eq, desc, and, sql, isNull } from "drizzle-orm";
import { db, paymentIntentsTable, systemSettingsTable, auditLogsTable, usersTable, plansTable, apiKeysTable } from "@workspace/db";
import { generateApiKey, encryptApiKey as encryptKey } from "../../lib/crypto";
import {
  retrieveBalance,
  ChargilyConfigError,
  ChargilyError,
  getChargilySecretsStatus,
  invalidateChargilySecretsCache,
  CHARGILY_SECRET_KEY_SETTING,
  CHARGILY_WEBHOOK_SECRET_SETTING,
} from "../../lib/chargily";
import { getChargilySettings, CHARGILY_ENABLED_SETTING, CHARGILY_MODE_SETTING } from "../../lib/chargilySettings";
import { encryptApiKey } from "../../lib/crypto";
import { getSettingValue } from "./settings";
import { logger } from "../../lib/logger";

/** Strict host-allowlist: scheme must be http/https, host must be a valid hostname[:port]. */
function sanitizeBaseUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Builds the public webhook URL the admin pastes into Chargily.
 * Priority: (1) admin-configured app_base_url setting (trusted), (2) the
 * APP_BASE_URL env, (3) Express's req.protocol+req.hostname (NOT raw forwarded
 * headers — those are spoofable). Returns a clear placeholder if nothing valid
 * is available so the admin sees they must configure app_base_url.
 */
async function buildWebhookUrl(req: { protocol: string; hostname: string }): Promise<string> {
  const fromSetting = sanitizeBaseUrl(await getSettingValue("app_base_url"));
  if (fromSetting) return `${fromSetting}/api/webhooks/chargily`;
  const fromEnv = sanitizeBaseUrl(process.env.APP_BASE_URL);
  if (fromEnv) return `${fromEnv}/api/webhooks/chargily`;
  const proto = req.protocol === "http" || req.protocol === "https" ? req.protocol : "https";
  const host = req.hostname;
  if (!host) return "Configure app_base_url in settings to generate webhook URL";
  return `${proto}://${host}/api/webhooks/chargily`;
}

const router: IRouter = Router();

/**
 * GET /admin/billing/chargily/balance
 * Reads the live wallet balance from Chargily so admins can monitor.
 */
router.get("/admin/billing/chargily/balance", async (_req, res): Promise<void> => {
  try {
    const balance = await retrieveBalance();
    res.json(balance);
  } catch (err) {
    if (err instanceof ChargilyConfigError) {
      res.status(503).json({ error: "Chargily not configured" });
      return;
    }
    if (err instanceof ChargilyError) {
      logger.error({ err: err.message, status: err.status }, "Chargily balance fetch failed");
      res.status(502).json({ error: "Chargily error", details: err.body });
      return;
    }
    throw err;
  }
});

/**
 * GET /admin/billing/chargily/settings
 * Returns the current admin-editable settings.
 */
router.get("/admin/billing/chargily/settings", async (_req, res): Promise<void> => {
  const settings = await getChargilySettings();
  res.json(settings);
});

/**
 * POST /admin/billing/chargily/settings
 * Updates dzdToUsdRate, minTopupDzd, maxTopupDzd. CHARGILY_MODE remains
 * env-controlled (it's a deployment concern, not a runtime toggle).
 */
router.post("/admin/billing/chargily/settings", async (req, res): Promise<void> => {
  const { dzdToUsdRate, minTopupDzd, maxTopupDzd } = req.body as {
    dzdToUsdRate?: unknown;
    minTopupDzd?: unknown;
    maxTopupDzd?: unknown;
    mode?: unknown;
  };

  const updates: { key: string; value: string }[] = [];
  function pick(key: string, raw: unknown, label: string, min: number, max: number): boolean {
    if (raw === undefined) return true;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      res.status(400).json({ error: `${label} must be a positive number` });
      return false;
    }
    if (n < min || n > max) {
      res.status(400).json({ error: `${label} must be between ${min} and ${max}` });
      return false;
    }
    updates.push({ key, value: String(n) });
    return true;
  }

  // Bounded ranges prevent typos that would massively over-credit (e.g. rate=0.1).
  if (!pick("chargily_dzd_to_usd_rate", dzdToUsdRate, "dzdToUsdRate", 50, 1000)) return;
  if (!pick("chargily_min_topup_dzd", minTopupDzd, "minTopupDzd", 100, 100_000)) return;
  if (!pick("chargily_max_topup_dzd", maxTopupDzd, "maxTopupDzd", 1000, 10_000_000)) return;

  // Optional `enabled` toggle — accepts boolean or the string "true"/"false".
  const enabledRaw = (req.body as { enabled?: unknown }).enabled;
  if (enabledRaw !== undefined) {
    const truthy =
      enabledRaw === true || enabledRaw === "true" || enabledRaw === 1 || enabledRaw === "1";
    const falsy =
      enabledRaw === false || enabledRaw === "false" || enabledRaw === 0 || enabledRaw === "0";
    if (!truthy && !falsy) {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    updates.push({ key: CHARGILY_ENABLED_SETTING, value: truthy ? "true" : "false" });
  }

  // Optional `mode` toggle — "live" or "test".
  const modeRaw = (req.body as { mode?: unknown }).mode;
  if (modeRaw !== undefined) {
    if (modeRaw !== "live" && modeRaw !== "test") {
      res.status(400).json({ error: "mode must be 'live' or 'test'" });
      return;
    }
    updates.push({ key: CHARGILY_MODE_SETTING, value: modeRaw });
  }

  for (const { key, value } of updates) {
    await db
      .insert(systemSettingsTable)
      .values({ key, value, encrypted: false })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value } });
  }

  await db.insert(auditLogsTable).values({
    action: "admin.chargily.settings_updated",
    actorId: Number(req.authUser!.sub),
    actorEmail: req.authUser!.email,
    details: JSON.stringify({ updates: updates.map(u => ({ key: u.key, value: u.value })) }),
    ip: req.ip,
  });

  const fresh = await getChargilySettings();
  res.json(fresh);
});

/**
 * GET /admin/billing/chargily/intents
 * Lists all payment intents across users (admin oversight).
 */
router.get("/admin/billing/chargily/intents", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10) || 200, 500);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const baseQuery = db
    .select()
    .from(paymentIntentsTable)
    .orderBy(desc(paymentIntentsTable.createdAt))
    .limit(limit);
  const rows = status
    ? await baseQuery.where(eq(paymentIntentsTable.status, status))
    : await baseQuery;
  res.json(rows);
});

/**
 * GET /admin/billing/chargily/secrets
 * Returns whether each Chargily secret is configured (without revealing values)
 * and the auto-generated webhook URL the admin must paste into Chargily.
 */
router.get("/admin/billing/chargily/secrets", async (req, res): Promise<void> => {
  const status = await getChargilySecretsStatus();
  res.json({
    ...status,
    webhookUrl: await buildWebhookUrl(req),
  });
});

/**
 * PUT /admin/billing/chargily/secrets
 * Stores the Chargily secret key and/or webhook secret in the encrypted
 * system_settings table. Empty/omitted fields are NOT touched. Sending an
 * explicit `null` clears the stored value (env fallback then takes over).
 */
router.put("/admin/billing/chargily/secrets", async (req, res): Promise<void> => {
  const { secretKey, webhookSecret } = req.body as {
    secretKey?: string | null;
    webhookSecret?: string | null;
  };

  const writes: Array<{ key: string; value: string | null; label: string }> = [];
  if (secretKey !== undefined) {
    writes.push({ key: CHARGILY_SECRET_KEY_SETTING, value: secretKey, label: "secretKey" });
  }
  if (webhookSecret !== undefined) {
    writes.push({ key: CHARGILY_WEBHOOK_SECRET_SETTING, value: webhookSecret, label: "webhookSecret" });
  }
  if (writes.length === 0) {
    res.status(400).json({ error: "Provide secretKey and/or webhookSecret" });
    return;
  }

  const updatedKeys: string[] = [];
  for (const w of writes) {
    if (w.value === null || (typeof w.value === "string" && w.value.trim() === "")) {
      // Clear stored value → env fallback takes over.
      await db.delete(systemSettingsTable).where(eq(systemSettingsTable.key, w.key));
      updatedKeys.push(`${w.label}:cleared`);
      continue;
    }
    if (typeof w.value !== "string") {
      res.status(400).json({ error: `${w.label} must be a string or null` });
      return;
    }
    const trimmed = w.value.trim();
    if (trimmed.length < 8) {
      res.status(400).json({ error: `${w.label} looks too short` });
      return;
    }
    const encrypted = encryptApiKey(trimmed);
    await db
      .insert(systemSettingsTable)
      .values({ key: w.key, value: encrypted, encrypted: true })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value: encrypted, encrypted: true },
      });
    updatedKeys.push(`${w.label}:set`);
  }

  invalidateChargilySecretsCache();

  await db.insert(auditLogsTable).values({
    action: "admin.chargily.secrets_updated",
    actorId: Number(req.authUser!.sub),
    actorEmail: req.authUser!.email,
    details: JSON.stringify({ updates: updatedKeys }),
    ip: req.ip,
  });

  const status = await getChargilySecretsStatus();
  res.json({ ...status, webhookUrl: await buildWebhookUrl(req) });
});

/**
 * POST /admin/billing/chargily/intents/:id/fulfill
 * Manually force-fulfill a pending payment intent (admin reconciliation).
 * Use when the Chargily webhook was not received but payment was confirmed.
 */
router.post("/admin/billing/chargily/intents/:id/fulfill", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid intent id" });
    return;
  }

  const [intent] = await db
    .select()
    .from(paymentIntentsTable)
    .where(eq(paymentIntentsTable.id, id))
    .limit(1);

  if (!intent) {
    res.status(404).json({ error: "Intent not found" });
    return;
  }
  if (intent.status !== "pending") {
    res.status(400).json({ error: `Intent is already ${intent.status}` });
    return;
  }

  // CAS update — mark as paid
  const updated = await db
    .update(paymentIntentsTable)
    .set({ status: "paid", creditedAt: new Date(), webhookReceivedAt: new Date() })
    .where(and(eq(paymentIntentsTable.id, id), eq(paymentIntentsTable.status, "pending")))
    .returning({ id: paymentIntentsTable.id, amountUsd: paymentIntentsTable.amountUsd, userId: paymentIntentsTable.userId });

  if (updated.length === 0) {
    res.status(409).json({ error: "Concurrent update conflict — already processed" });
    return;
  }

  const credited = updated[0];

  // Determine purpose from metadata
  let purpose: "topup" | "plan_upgrade" = "topup";
  let targetPlanId: number | null = null;
  try {
    const meta = intent.metadata ? JSON.parse(intent.metadata) as { purpose?: string; planId?: number } : null;
    if (meta?.purpose === "plan_upgrade" && Number.isInteger(meta.planId)) {
      purpose = "plan_upgrade";
      targetPlanId = meta.planId!;
    }
  } catch { /* treat as topup */ }

  if (purpose === "plan_upgrade" && targetPlanId !== null) {
    const [plan] = await db
      .select()
      .from(plansTable)
      .where(and(eq(plansTable.id, targetPlanId), eq(plansTable.isActive, true)))
      .limit(1);

    if (!plan) {
      // Fallback: credit top-up balance
      await db.update(usersTable)
        .set({ topupCreditBalance: sql`${usersTable.topupCreditBalance} + ${credited.amountUsd}` })
        .where(eq(usersTable.id, credited.userId));
    } else {
      const existingKeys = await db.select().from(apiKeysTable)
        .where(and(eq(apiKeysTable.userId, credited.userId), eq(apiKeysTable.isActive, true), isNull(apiKeysTable.organizationId)))
        .limit(10);
      const planlessKey = existingKeys.find(k => k.planId === null);
      const alreadyOnPlan = existingKeys.find(k => k.planId === targetPlanId);

      const now = new Date();
      const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
      const [userRow] = await db.select({ currentPlanId: usersTable.currentPlanId, currentPeriodEnd: usersTable.currentPeriodEnd, currentPeriodStartedAt: usersTable.currentPeriodStartedAt })
        .from(usersTable).where(eq(usersTable.id, credited.userId)).limit(1);
      const stillActive = userRow?.currentPlanId === targetPlanId && userRow?.currentPeriodEnd != null && userRow.currentPeriodEnd.getTime() > now.getTime();
      const periodEnd = new Date((stillActive ? userRow!.currentPeriodEnd! : now).getTime() + PERIOD_MS);
      const periodStartedAt = stillActive && userRow?.currentPeriodStartedAt ? userRow.currentPeriodStartedAt : now;

      if (alreadyOnPlan) {
        await db.update(usersTable).set({
          currentPlanId: targetPlanId, currentPeriodStartedAt: periodStartedAt, currentPeriodEnd: periodEnd,
          ...(plan.monthlyCredits > 0 ? { creditBalance: sql`credit_balance + ${plan.monthlyCredits}` } : {}),
        }).where(eq(usersTable.id, credited.userId));
      } else if (planlessKey) {
        await db.transaction(async (tx) => {
          await tx.update(apiKeysTable).set({ planId: targetPlanId }).where(eq(apiKeysTable.id, planlessKey.id));
          const upd: Record<string, unknown> = { currentPlanId: targetPlanId, currentPeriodStartedAt: periodStartedAt, currentPeriodEnd: periodEnd };
          if (plan.monthlyCredits > 0) upd["creditBalance"] = sql`credit_balance + ${plan.monthlyCredits}`;
          await tx.update(usersTable).set(upd).where(eq(usersTable.id, credited.userId));
        });
      } else {
        const { rawKey, keyHash, keyPrefix } = generateApiKey();
        const keyEncrypted = encryptKey(rawKey);
        await db.transaction(async (tx) => {
          await tx.insert(apiKeysTable).values({ userId: credited.userId, planId: targetPlanId, keyPrefix, keyHash, keyEncrypted, name: `${plan.name} Key`, isActive: true });
          const upd: Record<string, unknown> = { currentPlanId: targetPlanId, currentPeriodStartedAt: periodStartedAt, currentPeriodEnd: periodEnd };
          if (plan.monthlyCredits > 0) upd["creditBalance"] = sql`credit_balance + ${plan.monthlyCredits}`;
          await tx.update(usersTable).set(upd).where(eq(usersTable.id, credited.userId));
        });
      }
    }
  } else {
    await db.update(usersTable)
      .set({ topupCreditBalance: sql`${usersTable.topupCreditBalance} + ${credited.amountUsd}` })
      .where(eq(usersTable.id, credited.userId));
  }

  await db.insert(auditLogsTable).values({
    action: "admin.billing.intent.manual_fulfill",
    actorId: Number(req.authUser!.sub),
    actorEmail: req.authUser!.email,
    targetId: credited.id,
    details: JSON.stringify({ intentId: id, userId: credited.userId, purpose, targetPlanId, amountUsd: credited.amountUsd }),
    ip: req.ip,
  });

  logger.info({ intentId: id, userId: credited.userId, purpose, targetPlanId }, "Admin manually fulfilled payment intent");
  res.json({ ok: true, message: "Intent fulfilled successfully", intentId: id, purpose, targetPlanId });
});

export default router;
