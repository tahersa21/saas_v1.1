import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pageVisitsTable, pageEventsTable } from "@workspace/db";
import { sql, gte, and, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/admin/traffic", async (req, res): Promise<void> => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const todaySince = new Date();
    todaySince.setHours(0, 0, 0, 0);

    const [summary, daily, topPages, topReferrers, devices, recentVisitors, todayRow, topClicks, avgTimeOnPage] = await Promise.all([
      db
        .select({
          totalViews: sql<number>`count(*)::int`,
          uniqueVisitors: sql<number>`count(distinct ip_hash)::int`,
        })
        .from(pageVisitsTable)
        .where(gte(pageVisitsTable.visitedAt, since))
        .then((r) => r[0]),

      db
        .select({
          date: sql<string>`date_trunc('day', visited_at at time zone 'UTC')::date::text`,
          views: sql<number>`count(*)::int`,
          unique: sql<number>`count(distinct ip_hash)::int`,
        })
        .from(pageVisitsTable)
        .where(gte(pageVisitsTable.visitedAt, since))
        .groupBy(sql`date_trunc('day', visited_at at time zone 'UTC')::date`)
        .orderBy(sql`date_trunc('day', visited_at at time zone 'UTC')::date`),

      db
        .select({
          page: pageVisitsTable.page,
          views: sql<number>`count(*)::int`,
          unique: sql<number>`count(distinct ip_hash)::int`,
        })
        .from(pageVisitsTable)
        .where(gte(pageVisitsTable.visitedAt, since))
        .groupBy(pageVisitsTable.page)
        .orderBy(sql`count(*) desc`)
        .limit(10),

      db
        .select({
          referrer: pageVisitsTable.referrer,
          count: sql<number>`count(*)::int`,
        })
        .from(pageVisitsTable)
        .where(and(
          gte(pageVisitsTable.visitedAt, since),
          sql`referrer is not null and referrer != ''`,
        ))
        .groupBy(pageVisitsTable.referrer)
        .orderBy(sql`count(*) desc`)
        .limit(10),

      db
        .select({
          device: pageVisitsTable.device,
          count: sql<number>`count(*)::int`,
        })
        .from(pageVisitsTable)
        .where(gte(pageVisitsTable.visitedAt, since))
        .groupBy(pageVisitsTable.device)
        .orderBy(sql`count(*) desc`),

      db
        .select({
          page: pageVisitsTable.page,
          ip: pageVisitsTable.ip,
          device: pageVisitsTable.device,
          language: pageVisitsTable.language,
          referrer: pageVisitsTable.referrer,
          visitedAt: pageVisitsTable.visitedAt,
        })
        .from(pageVisitsTable)
        .where(gte(pageVisitsTable.visitedAt, since))
        .orderBy(desc(pageVisitsTable.visitedAt))
        .limit(50),

      db
        .select({
          views: sql<number>`count(*)::int`,
          unique: sql<number>`count(distinct ip_hash)::int`,
        })
        .from(pageVisitsTable)
        .where(gte(pageVisitsTable.visitedAt, todaySince))
        .then((r) => r[0]),

      // Top clicked elements on the landing page
      db
        .select({
          element: pageEventsTable.element,
          count: sql<number>`count(*)::int`,
        })
        .from(pageEventsTable)
        .where(and(
          gte(pageEventsTable.createdAt, since),
          eq(pageEventsTable.eventType, "click"),
          sql`element is not null`,
        ))
        .groupBy(pageEventsTable.element)
        .orderBy(sql`count(*) desc`)
        .limit(15),

      // Average time on landing page (in seconds)
      db
        .select({
          avgSeconds: sql<number>`round(avg(value))::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(pageEventsTable)
        .where(and(
          gte(pageEventsTable.createdAt, since),
          eq(pageEventsTable.eventType, "time_on_page"),
          eq(pageEventsTable.page, "/"),
          sql`value > 0 and value < 3600`,
        ))
        .then((r) => r[0]),
    ]);

    res.json({
      summary: {
        totalViews: summary?.totalViews ?? 0,
        uniqueVisitors: summary?.uniqueVisitors ?? 0,
        todayViews: todayRow?.views ?? 0,
        todayUnique: todayRow?.unique ?? 0,
      },
      daily,
      topPages,
      topReferrers,
      devices,
      recentVisitors,
      topClicks,
      avgTimeOnPage: {
        seconds: avgTimeOnPage?.avgSeconds ?? 0,
        count: avgTimeOnPage?.count ?? 0,
      },
    });
  } catch (err) {
    console.error("[admin/traffic]", err);
    res.status(500).json({ error: "Failed to fetch traffic data" });
  }
});

export default router;
