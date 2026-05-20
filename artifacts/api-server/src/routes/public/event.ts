import { Router, type IRouter } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db, pageEventsTable } from "@workspace/db";

const router: IRouter = Router();

const eventRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "") + ":event",
  skipFailedRequests: true,
});

const EventBody = z.object({
  eventType: z.enum(["click", "time_on_page"]),
  page: z.string().max(500),
  element: z.string().max(200).optional().nullable(),
  value: z.number().int().min(0).max(86400).optional().nullable(),
});

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + (process.env.ENCRYPTION_KEY ?? "salt")).digest("hex").slice(0, 16);
}

function detectDevice(ua: string): "mobile" | "tablet" | "desktop" {
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

router.post("/public/event", eventRateLimit, async (req, res): Promise<void> => {
  const parsed = EventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid" });
    return;
  }

  const rawIp = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  const ipHash = hashIp(rawIp);
  const ua = req.headers["user-agent"] ?? "";
  const device = detectDevice(ua);

  try {
    await db.insert(pageEventsTable).values({
      eventType: parsed.data.eventType,
      page: parsed.data.page,
      element: parsed.data.element ?? null,
      value: parsed.data.value ?? null,
      ipHash,
      device,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record event" });
  }
});

export default router;
