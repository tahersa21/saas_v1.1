import { Router, type IRouter } from "express";
import { db, announcementsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { announcementEvents } from "../../lib/announcement-events";

const router: IRouter = Router();

const VALID_TYPES = new Set(["info", "update", "promo", "maintenance", "warning"]);

router.get("/admin/announcements", async (_req, res): Promise<void> => {
  const rows = await db.select().from(announcementsTable).orderBy(desc(announcementsTable.createdAt)).limit(200);
  res.json({ announcements: rows });
});

router.post("/admin/announcements", async (req, res): Promise<void> => {
  const { titleEn, titleAr, bodyEn, bodyAr, type, isActive, expiresAt } = req.body ?? {};
  if (!titleEn || !titleAr) {
    res.status(400).json({ error: "titleEn and titleAr are required" });
    return;
  }
  const t = VALID_TYPES.has(type) ? type : "info";
  const [row] = await db.insert(announcementsTable).values({
    titleEn,
    titleAr,
    bodyEn: bodyEn ?? "",
    bodyAr: bodyAr ?? "",
    type: t,
    isActive: isActive !== false,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
  }).returning();
  announcementEvents.notifyChanged();
  res.status(201).json({ announcement: row });
});

router.patch("/admin/announcements/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { titleEn, titleAr, bodyEn, bodyAr, type, isActive, expiresAt } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (titleEn !== undefined) updates.titleEn = titleEn;
  if (titleAr !== undefined) updates.titleAr = titleAr;
  if (bodyEn !== undefined) updates.bodyEn = bodyEn;
  if (bodyAr !== undefined) updates.bodyAr = bodyAr;
  if (type !== undefined && VALID_TYPES.has(type)) updates.type = type;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const [row] = await db.update(announcementsTable).set(updates).where(eq(announcementsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  announcementEvents.notifyChanged();
  res.json({ announcement: row });
});

router.delete("/admin/announcements/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  announcementEvents.notifyChanged();
  res.status(204).end();
});

export default router;
