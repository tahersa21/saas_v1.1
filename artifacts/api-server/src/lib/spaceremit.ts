/**
 * Spaceremit payment gateway client.
 *
 * Docs: https://spaceremit.com
 *
 * Flow:
 *   1. Client-side: Spaceremit JS form embedded in the browser collects payment.
 *   2. On success, SP_SUCCESSFUL_PAYMENT(code) fires with a payment_id.
 *   3. Server-side: We call POST /api/v2/payment_info/ to verify the payment.
 *   4. If status_tag is A, B, D, E, or T → accept and credit.
 *
 * Note: Spaceremit does NOT use HMAC webhook signatures. Authentication
 * is done by re-verifying the payment via the API using the private key.
 */
import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";
import { logger } from "./logger";
import { decryptApiKey } from "./crypto";

const SPACEREMIT_API_BASE = "https://spaceremit.com/api/v2";

export const SPACEREMIT_PUBLIC_KEY_SETTING = "spaceremit_public_key";
export const SPACEREMIT_PRIVATE_KEY_SETTING = "spaceremit_private_key";

/**
 * Status tags that are considered "accepted" (payment is real or test).
 * A = Completed, B = Pending, D = WaitingHoldingTime, E = NeedsReview, T = TestPayment
 */
export const ACCEPTED_STATUS_TAGS = new Set(["A", "B", "D", "E", "T"]);

export class SpaceremitError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class SpaceremitConfigError extends Error {}

export interface SpaceremitPaymentData {
  id: string;
  type: string;
  currency: string;
  total_amount: string;
  original_amount: string;
  buyer_payed_amount: string;
  seller_received_amount: string;
  date: string;
  status: string;
  status_tag: string;
  notes: string;
  seller_public_key: string;
}

// ── In-memory cache (same pattern as chargily.ts) ──────────────────────────
interface CacheEntry { value: string; expiresAt: number; }
const keyCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export function invalidateSpaceremitKeyCache(): void {
  keyCache.clear();
}

async function readSettingFromDb(key: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value, encrypted: systemSettingsTable.encrypted })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, key))
      .limit(1);
    if (!row?.value) return null;
    if (row.encrypted) return decryptApiKey(row.value);
    return row.value;
  } catch {
    return null;
  }
}

async function readKey(settingKey: string, envKey: string): Promise<string | null> {
  const cached = keyCache.get(settingKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const fromDb = await readSettingFromDb(settingKey);
  if (fromDb) {
    keyCache.set(settingKey, { value: fromDb, expiresAt: Date.now() + CACHE_TTL_MS });
    return fromDb;
  }
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    keyCache.set(settingKey, { value: fromEnv, expiresAt: Date.now() + CACHE_TTL_MS });
    return fromEnv;
  }
  return null;
}

export async function getSpaceremitPublicKey(): Promise<string | null> {
  return readKey(SPACEREMIT_PUBLIC_KEY_SETTING, "SPACEREMIT_PUBLIC_KEY");
}

export async function getSpaceremitPrivateKey(): Promise<string | null> {
  return readKey(SPACEREMIT_PRIVATE_KEY_SETTING, "SPACEREMIT_PRIVATE_KEY");
}

export async function getSpaceremitKeyStatus(): Promise<{
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  publicKeySource: "db" | "env" | "none";
  privateKeySource: "db" | "env" | "none";
}> {
  const [pubDb, privDb] = await Promise.all([
    readSettingFromDb(SPACEREMIT_PUBLIC_KEY_SETTING),
    readSettingFromDb(SPACEREMIT_PRIVATE_KEY_SETTING),
  ]);
  const pubEnv = process.env["SPACEREMIT_PUBLIC_KEY"];
  const privEnv = process.env["SPACEREMIT_PRIVATE_KEY"];

  return {
    hasPublicKey: !!(pubDb || pubEnv),
    hasPrivateKey: !!(privDb || privEnv),
    publicKeySource: pubDb ? "db" : pubEnv ? "env" : "none",
    privateKeySource: privDb ? "db" : privEnv ? "env" : "none",
  };
}

/**
 * Verifies a Spaceremit payment by calling their payment_info API.
 * Returns the payment data if valid.
 * Throws SpaceremitConfigError if keys are missing.
 * Throws SpaceremitError if the API returns an error.
 */
export async function verifySpaceremitPayment(paymentId: string): Promise<SpaceremitPaymentData> {
  const privateKey = await getSpaceremitPrivateKey();
  if (!privateKey) {
    throw new SpaceremitConfigError("Spaceremit private key is not configured.");
  }

  const response = await fetch(`${SPACEREMIT_API_BASE}/payment_info/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ private_key: privateKey, payment_id: paymentId }),
  });

  const data = await response.json() as {
    response_status: string;
    message: string;
    data?: SpaceremitPaymentData;
  };

  if (!response.ok || data.response_status !== "success" || !data.data) {
    logger.warn({ paymentId, status: response.status, message: data.message }, "Spaceremit payment verification failed");
    throw new SpaceremitError(
      data.message || "Spaceremit verification failed",
      response.status,
      data
    );
  }

  return data.data;
}
