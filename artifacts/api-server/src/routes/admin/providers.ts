import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import * as zod from "zod";
import { db, providersTable } from "@workspace/db";
import { encryptApiKey, decryptApiKey } from "../../lib/crypto";
import { CreateProviderBody, UpdateProviderBody } from "@workspace/api-zod";
import { GoogleAuth } from "google-auth-library";
import { requireAdmin } from "../../middlewares/adminAuth";
import { validateProxyUrl, redactProxyUrl, getProxyAgent, fetchWithOptionalProxy } from "../../lib/proxy-agent";

const router: IRouter = Router();

// Local extensions to the auto-generated zod schemas: priority is part of
// our failover system but isn't yet in the OpenAPI spec. Must use the same
// zod version as the generated schemas (zod v3, imported as `* as zod`).
const CreateProviderBodyExt = CreateProviderBody.extend({
  priority: zod.number().int().min(0).max(10000).optional(),
  // Proxy is optional. Empty string == "no proxy".
  proxyUrl: zod.string().optional(),
  proxyEnabled: zod.boolean().optional(),
});
const UpdateProviderBodyExt = UpdateProviderBody.extend({
  priority: zod.number().int().min(0).max(10000).optional(),
  proxyUrl: zod.string().optional(),
  proxyEnabled: zod.boolean().optional(),
});

function toSafeProvider(p: typeof providersTable.$inferSelect) {
  // Health summary surfaced to the admin UI. We never expose the encrypted
  // credentials or the raw proxy URL; only metadata that helps an admin
  // diagnose issues. The proxy URL is shown redacted (password masked) so
  // admins can confirm which proxy is configured without leaking the secret.
  const now = Date.now();
  const circuitOpenMs = p.circuitOpenUntil ? p.circuitOpenUntil.getTime() - now : 0;
  const status: "healthy" | "degraded" | "down" =
    circuitOpenMs > 0 ? "down" :
    p.consecutiveFailures > 0 ? "degraded" :
    "healthy";
  let proxyUrlRedacted: string | null = null;
  if (p.proxyUrlEncrypted) {
    try {
      const raw = decryptApiKey(p.proxyUrlEncrypted);
      proxyUrlRedacted = redactProxyUrl(raw);
    } catch {
      proxyUrlRedacted = "<decryption failed>";
    }
  }
  return {
    id: p.id,
    name: p.name,
    projectId: p.projectId,
    location: p.location,
    isActive: p.isActive,
    priority: p.priority,
    status,
    circuitOpenUntil: p.circuitOpenUntil,
    consecutiveFailures: p.consecutiveFailures,
    lastError: p.lastError,
    lastFailureAt: p.lastFailureAt,
    lastSuccessAt: p.lastSuccessAt,
    proxyEnabled: p.proxyEnabled,
    proxyUrlRedacted,
    proxyConfigured: !!p.proxyUrlEncrypted,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

router.get("/admin/providers", requireAdmin, async (_req, res): Promise<void> => {
  const providers = await db
    .select()
    .from(providersTable)
    .orderBy(providersTable.priority, providersTable.createdAt);

  res.json(providers.map(toSafeProvider));
});

router.post("/admin/providers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateProviderBodyExt.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, projectId, location, credentialsJson, isActive, priority, proxyUrl, proxyEnabled } = parsed.data;

  let parsedCreds: Record<string, unknown>;
  try {
    parsedCreds = JSON.parse(credentialsJson) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "credentialsJson must be valid JSON" });
    return;
  }
  const requiredFields = ["type", "project_id", "private_key", "client_email"];
  const missingFields = requiredFields.filter(f => !(f in parsedCreds));
  if (missingFields.length > 0) {
    res.status(400).json({ error: `Invalid Google service account credentials. Missing fields: ${missingFields.join(", ")}` });
    return;
  }
  if (parsedCreds.type !== "service_account") {
    res.status(400).json({ error: 'Only Google service account credentials (type: "service_account") are supported' });
    return;
  }

  const credentialsEncrypted = encryptApiKey(credentialsJson);

  // Validate + encrypt proxy URL when supplied. We accept empty string as
  // "no proxy" so admins can clear it later by editing.
  let proxyUrlEncrypted: string | null = null;
  const trimmedProxy = (proxyUrl ?? "").trim();
  if (trimmedProxy.length > 0) {
    const proxyErr = validateProxyUrl(trimmedProxy);
    if (proxyErr) {
      res.status(400).json({ error: `Invalid proxy URL: ${proxyErr}` });
      return;
    }
    proxyUrlEncrypted = encryptApiKey(trimmedProxy);
  }

  // Same invariant as PUT: enabled ⇒ URL. Reject loudly instead of silently
  // coercing enabled to false — that would mask an admin mistake.
  if (proxyEnabled && !proxyUrlEncrypted) {
    res.status(400).json({ error: "Cannot enable proxy: no proxy URL provided. Provide proxyUrl in the same request." });
    return;
  }

  const [provider] = await db
    .insert(providersTable)
    .values({
      name, projectId, location, credentialsEncrypted, isActive,
      priority: priority ?? 100,
      proxyUrlEncrypted,
      proxyEnabled: !!proxyEnabled,
    })
    .returning();

  res.status(201).json(toSafeProvider(provider));
});

router.put("/admin/providers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateProviderBodyExt.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof providersTable.$inferInsert> = {};
  const { name, projectId, location, credentialsJson, isActive, priority, proxyUrl, proxyEnabled } = parsed.data;

  if (name !== undefined) updates.name = name;
  if (projectId !== undefined) updates.projectId = projectId;
  if (location !== undefined) updates.location = location;
  if (isActive !== undefined) updates.isActive = isActive;
  if (priority !== undefined) updates.priority = priority;

  // Proxy URL semantics on update:
  //   undefined → no change
  //   ""        → clear proxy (forces proxyEnabled=false regardless of payload)
  //   non-empty → validate + encrypt + store
  // Order matters: apply proxyUrl first, then evaluate proxyEnabled against
  // the resulting state so we never persist enabled=true with no stored URL.
  let proxyClearedThisRequest = false;
  let proxySetThisRequest = false;
  if (proxyUrl !== undefined) {
    const t = proxyUrl.trim();
    if (t.length === 0) {
      updates.proxyUrlEncrypted = null;
      proxyClearedThisRequest = true;
    } else {
      const proxyErr = validateProxyUrl(t);
      if (proxyErr) {
        res.status(400).json({ error: `Invalid proxy URL: ${proxyErr}` });
        return;
      }
      updates.proxyUrlEncrypted = encryptApiKey(t);
      proxySetThisRequest = true;
    }
  }
  if (proxyClearedThisRequest) {
    // Clearing the URL always disables the proxy — runtime invariant: enabled ⇒ URL.
    updates.proxyEnabled = false;
  } else if (proxyEnabled !== undefined) {
    if (proxyEnabled) {
      // Refuse to enable without a URL — either being set in this request,
      // or already on the existing row.
      if (!proxySetThisRequest) {
        const [existing] = await db
          .select({ proxyUrlEncrypted: providersTable.proxyUrlEncrypted })
          .from(providersTable)
          .where(eq(providersTable.id, id))
          .limit(1);
        if (!existing || !existing.proxyUrlEncrypted) {
          res.status(400).json({ error: "Cannot enable proxy: no proxy URL is stored. Provide a proxyUrl in the same request." });
          return;
        }
      }
      updates.proxyEnabled = true;
    } else {
      updates.proxyEnabled = false;
    }
  }

  if (credentialsJson && credentialsJson.trim().length > 0) {
    let parsedCreds: Record<string, unknown>;
    try {
      parsedCreds = JSON.parse(credentialsJson) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: "credentialsJson must be valid JSON" });
      return;
    }
    const requiredFields = ["type", "project_id", "private_key", "client_email"];
    const missingFields = requiredFields.filter(f => !(f in parsedCreds));
    if (missingFields.length > 0) {
      res.status(400).json({ error: `Invalid Google service account credentials. Missing fields: ${missingFields.join(", ")}` });
      return;
    }
    if (parsedCreds.type !== "service_account") {
      res.status(400).json({ error: 'Only Google service account credentials (type: "service_account") are supported' });
      return;
    }
    updates.credentialsEncrypted = encryptApiKey(credentialsJson);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [provider] = await db
    .update(providersTable)
    .set(updates)
    .where(eq(providersTable.id, id))
    .returning();

  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }

  res.json(toSafeProvider(provider));
});

/**
 * Manually clear a provider's circuit breaker (admin override).
 * Useful after an admin has fixed the underlying issue and wants the
 * provider re-enabled immediately rather than waiting for backoff.
 */
router.post("/admin/providers/:id/reset", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [provider] = await db
    .update(providersTable)
    .set({
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      lastError: null,
    })
    .where(eq(providersTable.id, id))
    .returning();
  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  res.json(toSafeProvider(provider));
});

router.post("/admin/providers/:id/test", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, message: "Invalid id" });
    return;
  }

  const [provider] = await db
    .select()
    .from(providersTable)
    .where(eq(providersTable.id, id))
    .limit(1);

  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found" });
    return;
  }

  try {
    const credentialsJson = decryptApiKey(provider.credentialsEncrypted);
    if (!credentialsJson) {
      res.json({ success: false, message: "Failed to decrypt provider credentials" });
      return;
    }
    const credentials = JSON.parse(credentialsJson);

    // If a proxy is configured AND enabled, route both the OAuth token
    // exchange and the Vertex API ping through it. Surface any proxy
    // misconfiguration as a clear test failure rather than silently
    // bypassing the proxy.
    let proxyUrlForTest: string | null = null;
    if (provider.proxyEnabled) {
      if (!provider.proxyUrlEncrypted) {
        res.json({ success: false, message: "Proxy is enabled for this provider but no proxy URL is stored — edit the provider to set one or disable the proxy." });
        return;
      }
      try {
        proxyUrlForTest = decryptApiKey(provider.proxyUrlEncrypted);
      } catch {
        res.json({ success: false, message: "Failed to decrypt stored proxy URL — re-save the proxy URL in the provider settings." });
        return;
      }
      const proxyErr = validateProxyUrl(proxyUrlForTest);
      if (proxyErr) {
        res.json({ success: false, message: `Stored proxy URL is invalid: ${proxyErr}` });
        return;
      }
    }

    let clientOptions: Record<string, unknown> | undefined;
    if (proxyUrlForTest) {
      try {
        // google-auth-library@10 reads agent from transporterOptions, NOT
        // from the top-level clientOptions. See lib/vertexai-provider.ts
        // authClientOptions() for the same pattern used in the runtime path.
        clientOptions = { transporterOptions: { agent: getProxyAgent(proxyUrlForTest) } };
      } catch (e) {
        res.json({ success: false, message: `Proxy setup failed: ${e instanceof Error ? e.message : String(e)}` });
        return;
      }
    }

    const auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      clientOptions,
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      res.json({ success: false, message: "Failed to obtain access token from Google — check that the service account key is valid." });
      return;
    }

    // Test Vertex AI access directly using the location endpoint
    const projectId = provider.projectId;
    const location = provider.location;
    const vertexUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}`;
    const abortCtrl = new AbortController();
    const fetchTimeout = setTimeout(() => abortCtrl.abort(), 10_000);
    const vertexRes = await fetchWithOptionalProxy(vertexUrl, {
      headers: { Authorization: `Bearer ${tokenResponse.token}` },
      signal: abortCtrl.signal,
    }, proxyUrlForTest);
    clearTimeout(fetchTimeout);

    if (!vertexRes.ok) {
      const errText = await vertexRes.text();
      let errMsg = "";
      try {
        const errJson = JSON.parse(errText) as { error?: { message?: string; status?: string } };
        errMsg = errJson?.error?.message ?? errText.slice(0, 300);
      } catch {
        errMsg = errText.slice(0, 300);
      }

      // Record failure on the provider record so dashboards reflect reality.
      await db.update(providersTable).set({
        lastError: errMsg.slice(0, 500),
        lastFailureAt: new Date(),
      }).where(eq(providersTable.id, id));

      if (vertexRes.status === 403) {
        res.json({ success: false, message: `Access denied to Vertex AI. Make sure the service account has the "Vertex AI User" role on project "${projectId}". Details: ${errMsg}` });
      } else if (vertexRes.status === 404) {
        res.json({ success: false, message: `Location "${location}" not found in project "${projectId}". Check your Project ID and Region.` });
      } else {
        res.json({ success: false, message: `Vertex AI error ${vertexRes.status}: ${errMsg}` });
      }
      return;
    }

    // Success → also clear the circuit breaker so the provider is immediately
    // available for live traffic.
    await db.update(providersTable).set({
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      lastError: null,
      lastSuccessAt: new Date(),
    }).where(eq(providersTable.id, id));

    const proxyNote = proxyUrlForTest ? ` via proxy ${redactProxyUrl(proxyUrlForTest)}` : "";
    res.json({ success: true, message: `Connection successful — credentials are valid and Vertex AI is accessible in project "${projectId}" (${location})${proxyNote}.` });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      res.json({ success: false, message: "Connection timed out after 10 seconds. Verify the Project ID and Region, then try again." });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ success: false, message: msg });
  }
});

router.delete("/admin/providers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = await db
    .delete(providersTable)
    .where(eq(providersTable.id, id))
    .returning({ id: providersTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }

  res.status(204).end();
});

export default router;
