/**
 * Admin routes for Spaceremit gateway management.
 *
 * GET  /admin/billing/spaceremit/settings    — current settings
 * POST /admin/billing/spaceremit/settings    — update settings
 * GET  /admin/billing/spaceremit/keys        — key status (no values)
 * PUT  /admin/billing/spaceremit/keys        — save/clear keys
 * GET  /admin/billing/spaceremit/intents     — list all intents (admin)
 * POST /admin/billing/spaceremit/intents/:id/fulfill  — manual fulfillment
 */
import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  spaceremitPaymentIntentsTable,
  systemSettingsTable,
  auditLogsTable,
  usersTable,
  plansTable,
} from "@workspace/db";
import { encryptApiKey } from "../../lib/crypto";
import {
  getSpaceremitKeyStatus,
  invalidateSpaceremitKeyCache,
  SPACEREMIT_PUBLIC_KEY_SETTING,
  SPACEREMIT_PRIVATE_KEY_SETTING,
} from "../../lib/spaceremit";
import {
  getSpaceremitSettings,
  SPACEREMIT_ENABLED_SETTING,
  SPACEREMIT_MIN_TOPUP_USD_SETTING,
  SPACEREMIT_MAX_TOPUP_USD_SETTING,
  SPACEREMIT_MODE_SETTING,
} from "../../lib/spaceremitSettings";
import { getSettingValue } from "./settings";
import { logger } from "../../lib/logger";

function sanitizeBaseUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

async function buildCallbackUrl(req: { protocol: string; hostname: string }): Promise<string> {
  const fromSetting = sanitizeBaseUrl(await getSettingValue("app_base_url"));
  if (fromSetting) return `${fromSetting}/api/webhooks/spaceremit`;
  const fromEnv = sanitizeBaseUrl(process.env.APP_BASE_URL);
  if (fromEnv) return `${fromEnv}/api/webhooks/spaceremit`;
  const proto = req.protocol === "http" || req.protocol === "https" ? req.protocol : "https";
  if (!req.hostname) return "Configure app_base_url in settings to generate callback URL";
  return `${proto}://${req.hostname}/api/webhooks/spaceremit`;
}

const router: IRouter = Router();

// ── Settings ─────────────────────────────────────────────────────────────────

router.get("/admin/billing/spaceremit/settings", async (_req, res): Promise<void> => {
  res.json(await getSpaceremitSettings());
});

router.post("/admin/billing/spaceremit/settings", async (req, res): Promise<void> => {
  const { enabled, mode, minTopupUsd, maxTopupUsd } = req.body as {
    enabled?: unknown;
    mode?: unknown;
    minTopupUsd?: unknown;
    maxTopupUsd?: unknown;
  };

  const updates: { key: string; value: string }[] = [];

  function pickNumeric(key: string, raw: unknown, label: string, min: number, max: number): boolean {
    if (raw === undefined) return true;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      res.status(400).json({ error: `${label} must be a positive number` }); return false;
    }
    if (n < min || n > max) {
      res.status(400).json({ error: `${label} must be between ${min} and ${max}` }); return false;
    }
    updates.push({ key, value: String(n) }); return true;
  }

  if (!pickNumeric(SPACEREMIT_MIN_TOPUP_USD_SETTING, minTopupUsd, "minTopupUsd", 0.01, 100_000)) return;
  if (!pickNumeric(SPACEREMIT_MAX_TOPUP_USD_SETTING, maxTopupUsd, "maxTopupUsd", 1, 1_000_000)) return;

  if (enabled !== undefined) {
    const truthy = enabled === true || enabled === "true" || enabled === 1 || enabled === "1";
    const falsy = enabled === false || enabled === "false" || enabled === 0 || enabled === "0";
    if (!truthy && !falsy) { res.status(400).json({ error: "enabled must be boolean" }); return; }
    updates.push({ key: SPACEREMIT_ENABLED_SETTING, value: truthy ? "true" : "false" });
  }

  if (mode !== undefined) {
    if (mode !== "test" && mode !== "live") { res.status(400).json({ error: "mode must be 'test' or 'live'" }); return; }
    updates.push({ key: SPACEREMIT_MODE_SETTING, value: mode as string });
  }

  for (const { key, value } of updates) {
    await db.insert(systemSettingsTable)
      .values({ key, value, encrypted: false })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value } });
  }

  await db.insert(auditLogsTable).values({
    action: "admin.spaceremit.settings_updated",
    actorId: Number(req.authUser!.sub),
    actorEmail: req.authUser!.email,
    details: JSON.stringify({ updates }),
    ip: req.ip,
  });

  res.json(await getSpaceremitSettings());
});

// ── Keys ─────────────────────────────────────────────────────────────────────

router.get("/admin/billing/spaceremit/keys", async (req, res): Promise<void> => {
  const status = await getSpaceremitKeyStatus();
  res.json({ ...status, callbackUrl: await buildCallbackUrl(req) });
});

router.put("/admin/billing/spaceremit/keys", async (req, res): Promise<void> => {
  const { publicKey, privateKey } = req.body as {
    publicKey?: string | null;
    privateKey?: string | null;
  };

  const writes: Array<{ settingKey: string; value: string | null; label: string; encrypt: boolean }> = [];
  if (publicKey !== undefined) {
    writes.push({ settingKey: SPACEREMIT_PUBLIC_KEY_SETTING, value: publicKey, label: "publicKey", encrypt: false });
  }
  if (privateKey !== undefined) {
    writes.push({ settingKey: SPACEREMIT_PRIVATE_KEY_SETTING, value: privateKey, label: "privateKey", encrypt: true });
  }
  if (writes.length === 0) {
    res.status(400).json({ error: "Provide publicKey and/or privateKey" }); return;
  }

  const updatedKeys: string[] = [];
  for (const w of writes) {
    if (w.value === null || (typeof w.value === "string" && w.value.trim() === "")) {
      await db.delete(systemSettingsTable).where(eq(systemSettingsTable.key, w.settingKey));
      updatedKeys.push(`${w.label}:cleared`);
      continue;
    }
    if (typeof w.value !== "string") {
      res.status(400).json({ error: `${w.label} must be a string or null` }); return;
    }
    const trimmed = w.value.trim();
    if (trimmed.length < 4) {
      res.status(400).json({ error: `${w.label} looks too short` }); return;
    }
    const stored = w.encrypt ? encryptApiKey(trimmed) : trimmed;
    await db.insert(systemSettingsTable)
      .values({ key: w.settingKey, value: stored, encrypted: w.encrypt })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: stored, encrypted: w.encrypt } });
    updatedKeys.push(`${w.label}:set`);
  }

  invalidateSpaceremitKeyCache();

  await db.insert(auditLogsTable).values({
    action: "admin.spaceremit.keys_updated",
    actorId: Number(req.authUser!.sub),
    actorEmail: req.authUser!.email,
    details: JSON.stringify({ updates: updatedKeys }),
    ip: req.ip,
  });

  const status = await getSpaceremitKeyStatus();
  res.json({ ...status, callbackUrl: await buildCallbackUrl(req) });
});

// ── Intents (read-only list) ──────────────────────────────────────────────────

router.get("/admin/billing/spaceremit/intents", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10) || 200, 500);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  const baseQuery = db
    .select()
    .from(spaceremitPaymentIntentsTable)
    .orderBy(desc(spaceremitPaymentIntentsTable.createdAt))
    .limit(limit);

  const rows = status
    ? await baseQuery.where(eq(spaceremitPaymentIntentsTable.status, status))
    : await baseQuery;

  res.json(rows);
});

// ── Manual fulfillment (admin reconciliation) ─────────────────────────────────

router.post("/admin/billing/spaceremit/intents/:id/fulfill", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid intent id" }); return;
  }

  const [intent] = await db
    .select()
    .from(spaceremitPaymentIntentsTable)
    .where(eq(spaceremitPaymentIntentsTable.id, id))
    .limit(1);

  if (!intent) { res.status(404).json({ error: "Intent not found" }); return; }
  if (intent.status === "credited") { res.status(400).json({ error: "Already credited" }); return; }

  const now = new Date();
  const metadata = intent.metadata
    ? JSON.parse(intent.metadata) as { purpose?: string; planId?: number; planName?: string }
    : {};

  const [updated] = await db.update(spaceremitPaymentIntentsTable)
    .set({ status: "credited", statusTag: "A", verifiedAt: now, creditedAt: now })
    .where(eq(spaceremitPaymentIntentsTable.id, id))
    .returning({ id: spaceremitPaymentIntentsTable.id });

  if (!updated) { res.status(409).json({ error: "Concurrent update conflict" }); return; }

  if (metadata.purpose === "plan_upgrade" && metadata.planId) {
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    const [plan] = await db.select({ credits: plansTable.creditBalance })
      .from(plansTable).where(eq(plansTable.id, metadata.planId)).limit(1);
    await db.update(usersTable).set({
      currentPlanId: metadata.planId,
      creditBalance: plan ? sql`credit_balance + ${plan.credits}` : sql`credit_balance`,
      currentPeriodEnd: periodEnd,
    }).where(eq(usersTable.id, intent.userId));
  } else {
    await db.update(usersTable)
      .set({ topupCreditBalance: sql`${usersTable.topupCreditBalance} + ${intent.amountUsd}` })
      .where(eq(usersTable.id, intent.userId));
  }

  await db.insert(auditLogsTable).values({
    action: "admin.spaceremit.intent.manual_fulfill",
    actorId: Number(req.authUser!.sub),
    actorEmail: req.authUser!.email,
    targetId: id,
    details: JSON.stringify({ intentId: id, userId: intent.userId, amountUsd: intent.amountUsd, metadata }),
    ip: req.ip,
  });

  logger.info({ intentId: id, userId: intent.userId }, "Admin manually fulfilled Spaceremit intent");
  res.json({ ok: true, message: "Intent fulfilled successfully", intentId: id });
});

export default router;
