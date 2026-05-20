import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";

export const SPACEREMIT_ENABLED_SETTING = "spaceremit_enabled";
export const SPACEREMIT_MIN_TOPUP_USD_SETTING = "spaceremit_min_topup_usd";
export const SPACEREMIT_MAX_TOPUP_USD_SETTING = "spaceremit_max_topup_usd";
export const SPACEREMIT_MODE_SETTING = "spaceremit_mode";

const DEFAULTS = {
  min_topup_usd: 1,
  max_topup_usd: 10_000,
} as const;

async function readNumeric(key: string, fallback: number): Promise<number> {
  const [row] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, key))
    .limit(1);
  if (!row?.value) return fallback;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function readEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, SPACEREMIT_ENABLED_SETTING))
    .limit(1);
  if (!row?.value) return false;
  return row.value === "true" || row.value === "1";
}

export async function isSpaceremitEnabled(): Promise<boolean> {
  return readEnabled();
}

export async function getSpaceremitSettings(): Promise<{
  minTopupUsd: number;
  maxTopupUsd: number;
  mode: "test" | "live";
  enabled: boolean;
}> {
  const [min, max, enabled] = await Promise.all([
    readNumeric(SPACEREMIT_MIN_TOPUP_USD_SETTING, DEFAULTS.min_topup_usd),
    readNumeric(SPACEREMIT_MAX_TOPUP_USD_SETTING, DEFAULTS.max_topup_usd),
    readEnabled(),
  ]);
  const modeRow = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, SPACEREMIT_MODE_SETTING))
    .limit(1);
  const mode = modeRow[0]?.value === "live" ? "live" : "test";
  return { minTopupUsd: min, maxTopupUsd: max, mode, enabled };
}
