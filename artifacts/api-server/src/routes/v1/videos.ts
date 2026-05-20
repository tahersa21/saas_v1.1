import { Router, type IRouter } from "express";
import multer from "multer";
import { eq, and } from "drizzle-orm";
import { db, usageLogsTable } from "@workspace/db";
import { requireApiKey, requireApiKeyLight } from "../../middlewares/apiKeyAuth";
import { createVideoJob, getVideoStatusForUser, streamVideoContent } from "../../lib/videoService";
import { generateRequestId } from "../../lib/crypto";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

// OpenAI Sora's POST /v1/videos uses multipart/form-data (per official spec).
// Clients like n8n's OpenAI node, openai-python, openai-node all send this
// content-type — express.json() leaves req.body empty for these requests.
// We accept any field name (model, prompt, seconds, size, input_reference, …)
// and let the JSON branch below handle pure-JSON callers transparently.
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, fields: 32 },
});

function videoBodyParser(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void {
  const ct = String(req.headers["content-type"] ?? "").toLowerCase();
  if (ct.startsWith("multipart/form-data")) {
    videoUpload.any()(req, res, next);
    return;
  }
  next();
}

// ─── Sora-compatible model aliases (mapped to Veo backend) ─────────────────
const SORA_TO_VEO: Record<string, string> = {
  "sora-2":          "veo-3.1-fast-generate-001",
  "sora-2-pro":      "veo-3.1-generate-001",
  "sora-1.0-turbo":  "veo-3.0-generate-001",
  "sora-1.0-mini":   "veo-2.0-generate-001",
};

// Valid durations (seconds) per Veo model.
// veo-2.0 does NOT support 4 seconds — min is 5.
// veo-3.x supports 4–8 seconds.
const VALID_DURATIONS_BY_MODEL: Record<string, number[]> = {
  "veo-3.1-generate-001":      [4, 5, 6, 7, 8],
  "veo-3.1-fast-generate-001": [4, 5, 6, 7, 8],
  "veo-3.0-generate-001":      [4, 5, 6, 7, 8],
  "veo-2.0-generate-001":      [5, 6, 7, 8],
};
// For backward compat (max-only callers).
const MAX_DURATION_BY_MODEL: Record<string, number> = Object.fromEntries(
  Object.entries(VALID_DURATIONS_BY_MODEL).map(([k, v]) => [k, Math.max(...v)]),
);

function mapModel(model: string | undefined): string {
  if (!model) return "veo-3.1-fast-generate-001";
  const lower = model.toLowerCase().trim();
  return SORA_TO_VEO[lower] ?? lower;
}

function reverseMapModel(veoModel: string): string {
  for (const [sora, veo] of Object.entries(SORA_TO_VEO)) {
    if (veo === veoModel) return sora;
  }
  return veoModel;
}

type SecondsParse =
  | { ok: true; value: number; snapped?: boolean }
  | { ok: false; error: string };

/**
 * Parse and validate the requested duration.
 *
 * If the value is not in the model's valid set we snap UP to the nearest
 * valid duration instead of rejecting — this prevents n8n's default of
 * "4 seconds" from hard-failing on veo-2.0 (which only supports 5–8 s).
 * Snapping is safe: billing uses the actual submitted value so the user is
 * never overcharged for the snap.
 */
function parseSeconds(input: unknown, validDurations: number[], modelLabel: string, backendModel: string): SecondsParse {
  const max = Math.max(...validDurations);
  const min = Math.min(...validDurations);

  let n: number | null = null;
  // No input → use model minimum (safe default).
  if (input === undefined || input === null || input === "") n = min;
  else if (typeof input === "number" && Number.isFinite(input)) n = Math.trunc(input);
  else if (typeof input === "string") {
    const parsed = Number(input.trim());
    if (Number.isFinite(parsed)) n = Math.trunc(parsed);
  }
  if (n === null || n <= 0) {
    return { ok: false, error: `seconds must be a positive integer (got ${JSON.stringify(input)}).` };
  }
  if (n > max) {
    return {
      ok: false,
      error: `${modelLabel} (powered by ${backendModel}) supports up to ${max} seconds — you requested ${n}.`,
    };
  }
  // Snap to nearest valid duration (round up).
  if (!validDurations.includes(n)) {
    const snapped = validDurations.find((d) => d >= n!) ?? max;
    return { ok: true, value: snapped, snapped: true };
  }
  return { ok: true, value: n };
}

function statusToOpenAI(internal: string): string {
  switch (internal) {
    case "completed": return "completed";
    case "failed":    return "failed";
    case "pending":   return "in_progress";
    default:          return "queued";
  }
}

function buildVideoObject(args: {
  jobId: string;
  status: string;
  veoModel: string;
  seconds: number;
  size: string;
  errorMessage?: string | null;
}) {
  const { jobId, status, veoModel, seconds, size, errorMessage } = args;
  return {
    id: `video_${jobId}`,
    object: "video",
    model: reverseMapModel(veoModel),
    status: statusToOpenAI(status),
    created_at: Math.floor(Date.now() / 1000),
    seconds: String(seconds),
    size,
    progress: status === "completed" ? 100 : status === "pending" ? 50 : 0,
    error: errorMessage ? { message: errorMessage } : null,
  };
}

function jobIdFromOpenAIId(rawId: string): string {
  return rawId.startsWith("video_") ? rawId.slice("video_".length) : rawId;
}

/**
 * Look up the original Sora request body for this jobId so we can return the
 * user's actual `seconds` and `size` (not hardcoded). Returns null if not found
 * or unparseable.
 */
async function loadOriginalRequest(apiKeyId: number, jobId: string): Promise<{ seconds?: number; size?: string } | null> {
  try {
    const rows = await db
      .select({ requestBody: usageLogsTable.requestBody })
      .from(usageLogsTable)
      .where(and(eq(usageLogsTable.requestId, jobId), eq(usageLogsTable.apiKeyId, apiKeyId)))
      .limit(1);
    if (rows.length === 0 || !rows[0]!.requestBody) return null;
    const parsed = JSON.parse(rows[0]!.requestBody) as Record<string, unknown>;
    const out: { seconds?: number; size?: string } = {};
    if (typeof parsed.seconds === "string") out.seconds = Number(parsed.seconds);
    else if (typeof parsed.seconds === "number") out.seconds = parsed.seconds;
    if (typeof parsed.size === "string") out.size = parsed.size;
    return out;
  } catch {
    return null;
  }
}

// ─── POST /v1/videos — create a Sora-shaped video job ────────────────────────
router.post("/v1/videos", videoBodyParser, requireApiKey, async (req, res): Promise<void> => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const veoModel = mapModel(body.model);
  const aliasLabel = reverseMapModel(veoModel);

  // Transparency FIRST — set on every response, including early validation errors.
  res.setHeader("X-Backend-Model", veoModel);

  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt) {
    res.status(400).json({
      error: { message: "prompt is required", type: "invalid_request_error", code: "missing_prompt" },
    });
    return;
  }

  const validDurations = VALID_DURATIONS_BY_MODEL[veoModel] ?? [5, 6, 7, 8];
  const secondsParse = parseSeconds(body.seconds, validDurations, aliasLabel, veoModel);
  if (!secondsParse.ok) {
    res.status(400).json({
      error: { message: secondsParse.error, type: "invalid_request_error", code: "invalid_seconds" },
    });
    return;
  }
  const seconds = secondsParse.value;
  // If the requested duration was snapped to a valid value, inform the client.
  if (secondsParse.snapped) {
    res.setHeader("X-Duration-Snapped", String(seconds));
  }
  const size = typeof body.size === "string" ? body.size : "1280x720";

  const requestId = req.preassignedRequestId ?? generateRequestId();

  // Image-to-Video: accept image_url (Sora-style) or image (our native field)
  const imageInput: string | undefined =
    typeof body.image_url === "string" && body.image_url
      ? body.image_url
      : typeof body.image === "string" && body.image
        ? body.image
        : undefined;
  const imageMimeType: string | undefined =
    typeof body.image_mime_type === "string" ? body.image_mime_type :
    typeof body.imageMimeType === "string" ? body.imageMimeType : undefined;

  const result = await createVideoJob({
    apiKey: req.apiKey!,
    model: veoModel,
    prompt,
    durationSeconds: seconds,
    sampleCount: 1,
    requestId,
    image: imageInput,
    imageMimeType,
  });

  if (!result.ok) {
    // Friendly error message for known limits
    let message = result.error;
    if (/duration/i.test(result.error) && /must|exceed|max/i.test(result.error)) {
      message = `${reverseMapModel(veoModel)} (powered by ${veoModel}) supports up to ${Math.max(...validDurations)} seconds. ${result.error}`;
    }
    // Rewrite Vertex transient failures (503/UNAVAILABLE etc.) into a clear,
    // actionable message — and surface them as 503 (not 502) so OpenAI clients
    // treat them as retryable.
    let httpStatus = result.status;
    let errType: string =
      result.status === 429 ? "rate_limit_exceeded"
      : result.status === 402 ? "insufficient_credit"
      : result.status === 403 ? "model_not_allowed"
      : "api_error";
    if (result.status === 502 && /unavailable|UNAVAILABLE|503|500|504|temporarily/i.test(result.error)) {
      message = "Vertex AI is temporarily unavailable. Please retry your request in 30-60 seconds. (No credit was charged.)";
      httpStatus = 503;
      errType = "service_unavailable";
    }
    res.status(httpStatus).json({
      error: { message, type: errType },
    });
    return;
  }

  res.status(200).json(buildVideoObject({
    jobId: result.jobId,
    status: result.duplicateOf ? "pending" : "pending",
    veoModel,
    seconds,
    size,
    errorMessage: null,
  }));
});

// ─── GET /v1/videos/:id — Sora-shaped status poll ────────────────────────────
router.get("/v1/videos/:id", requireApiKeyLight, async (req, res): Promise<void> => {
  const jobId = jobIdFromOpenAIId(String(req.params.id));
  const apiKey = req.apiKey!;

  const status = await getVideoStatusForUser(apiKey, jobId);
  if (!status.ok) {
    // Header may be unknown on lookup failure — still set a hint when possible.
    res.status(status.status).json({
      error: {
        message: status.error,
        type: status.status === 404 ? "invalid_request_error" : "api_error",
      },
    });
    return;
  }

  res.setHeader("X-Backend-Model", status.model);

  // Restore original seconds/size (no hardcoded values)
  const original = await loadOriginalRequest(apiKey.id, jobId);
  const seconds = original?.seconds ?? 4;
  const size = original?.size ?? "1280x720";

  res.status(200).json(buildVideoObject({
    jobId,
    status: status.status,
    veoModel: status.model,
    seconds,
    size,
    errorMessage: status.errorMessage,
  }));
});

// ─── GET /v1/videos/:id/content — stream the MP4 bytes ───────────────────────
router.get("/v1/videos/:id/content", requireApiKeyLight, async (req, res): Promise<void> => {
  const jobId = jobIdFromOpenAIId(String(req.params.id));
  try {
    await streamVideoContent(req.apiKey!, jobId, res);
  } catch (err) {
    logger.warn({ err, jobId }, "streamVideoContent failed");
    if (!res.headersSent) {
      res.status(502).json({ error: { message: "Video stream failed", type: "api_error" } });
    }
  }
});

export default router;
