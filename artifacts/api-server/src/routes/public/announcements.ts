import { Router, type IRouter } from "express";
import { db, announcementsTable } from "@workspace/db";
import { and, eq, or, gt, isNull, desc } from "drizzle-orm";
import { announcementEvents } from "../../lib/announcement-events";

const router: IRouter = Router();

async function fetchActiveAnnouncements() {
  const now = new Date();
  return db
    .select({
      id: announcementsTable.id,
      titleEn: announcementsTable.titleEn,
      titleAr: announcementsTable.titleAr,
      bodyEn: announcementsTable.bodyEn,
      bodyAr: announcementsTable.bodyAr,
      type: announcementsTable.type,
      createdAt: announcementsTable.createdAt,
      expiresAt: announcementsTable.expiresAt,
    })
    .from(announcementsTable)
    .where(
      and(
        eq(announcementsTable.isActive, true),
        or(isNull(announcementsTable.expiresAt), gt(announcementsTable.expiresAt, now)),
      ),
    )
    .orderBy(desc(announcementsTable.createdAt))
    .limit(20);
}

router.get("/public/announcements/active", async (_req, res): Promise<void> => {
  const rows = await fetchActiveAnnouncements();
  res.set("Cache-Control", "no-store");
  res.json({ announcements: rows });
});

// Server-Sent Events stream — pushes the active announcements list to clients
// the moment an admin creates / updates / deletes one. Each connected user gets
// the new message in real time without polling.
router.get("/public/announcements/stream", async (req, res): Promise<void> => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = async () => {
    try {
      const rows = await fetchActiveAnnouncements();
      res.write(`data: ${JSON.stringify({ announcements: rows })}\n\n`);
    } catch {
      // ignore — connection will just stay alive
    }
  };

  // Initial snapshot
  await send();

  const onChange = () => { void send(); };
  announcementEvents.on("changed", onChange);

  // Heartbeat every 25s to keep proxies (Cloudflare etc.) from dropping
  // the long-lived connection as idle.
  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    announcementEvents.off("changed", onChange);
    res.end();
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
});

export default router;
