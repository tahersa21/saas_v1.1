import { Router, type IRouter } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { pageVisitsTable } from "@workspace/db";

const router: IRouter = Router();

const trackRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "") + ":track",
  skipFailedRequests: true,
});

const TrackBody = z.object({
  page: z.string().max(500),
  referrer: z.string().max(500).optional().nullable(),
  language: z.string().max(20).optional().nullable(),
  screenWidth: z.number().int().min(0).max(10000).optional().nullable(),
});

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + (process.env.ENCRYPTION_KEY ?? "salt")).digest("hex").slice(0, 16);
}

function detectDevice(ua: string): "mobile" | "tablet" | "desktop" {
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

function maskIp(ip: string): string {
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + ":****";
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  return ip;
}

router.post("/public/track", trackRateLimit, async (req, res): Promise<void> => {
  const parsed = TrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid" });
    return;
  }

  const rawIp = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  const ipHash = hashIp(rawIp);
  const ip = maskIp(rawIp);
  const ua = req.headers["user-agent"] ?? "";
  const device = detectDevice(ua);

  try {
    await db.insert(pageVisitsTable).values({
      page: parsed.data.page,
      referrer: parsed.data.referrer ?? null,
      language: parsed.data.language ?? null,
      screenWidth: parsed.data.screenWidth ?? null,
      ipHash,
      ip,
      device,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record visit" });
  }
});

export default router;
