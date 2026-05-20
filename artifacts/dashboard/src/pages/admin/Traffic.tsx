import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/authFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from "recharts";
import { Eye, Users, TrendingUp, Calendar, Monitor, Smartphone, Tablet, Clock, MousePointerClick } from "lucide-react";
import { format, parseISO } from "date-fns";
import i18n from "@/i18n";

interface TrafficData {
  summary: { totalViews: number; uniqueVisitors: number; todayViews: number; todayUnique: number };
  daily: { date: string; views: number; unique: number }[];
  topPages: { page: string; views: number; unique: number }[];
  topReferrers: { referrer: string | null; count: number }[];
  devices: { device: string | null; count: number }[];
  recentVisitors: {
    page: string;
    ip: string | null;
    device: string | null;
    language: string | null;
    referrer: string | null;
    visitedAt: string;
  }[];
  topClicks: { element: string | null; count: number }[];
  avgTimeOnPage: { seconds: number; count: number };
}

const PRESETS = [
  { label: "7 أيام", labelEn: "7 Days", days: 7 },
  { label: "30 يوم", labelEn: "30 Days", days: 30 },
  { label: "90 يوم", labelEn: "90 Days", days: 90 },
];

const DEVICE_COLORS: Record<string, string> = {
  desktop: "hsl(var(--primary))",
  mobile: "#22c55e",
  tablet: "#f59e0b",
};

const ELEMENT_LABELS: Record<string, { ar: string; en: string }> = {
  hero_signup: { ar: "تسجيل الهيرو", en: "Hero Sign Up" },
  hero_docs: { ar: "توثيق الهيرو", en: "Hero Docs" },
  nav_login: { ar: "تسجيل دخول Nav", en: "Nav Login" },
  nav_signup: { ar: "تسجيل Nav", en: "Nav Sign Up" },
  cta_signup: { ar: "تسجيل CTA", en: "CTA Sign Up" },
  cta_login: { ar: "دخول CTA", en: "CTA Login" },
  code_tab_python: { ar: "تاب Python", en: "Python Tab" },
  code_tab_javascript: { ar: "تاب Node.js", en: "Node.js Tab" },
  code_tab_curl: { ar: "تاب cURL", en: "cURL Tab" },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const DeviceIcon = ({ device }: { device: string | null }) => {
  if (device === "mobile") return <Smartphone className="h-3.5 w-3.5 text-green-500" />;
  if (device === "tablet") return <Tablet className="h-3.5 w-3.5 text-amber-500" />;
  return <Monitor className="h-3.5 w-3.5 text-primary" />;
};

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Eye; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{typeof value === "number" ? value.toLocaleString() : value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminTraffic() {
  const isAr = i18n.language === "ar";
  const [days, setDays] = useState(30);

  const { data, isLoading, isError } = useQuery<TrafficData>({
    queryKey: ["admin-traffic", days],
    queryFn: async () => {
      const res = await authFetch(`/api/admin/traffic?days=${days}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const chartData = data?.daily.map((d) => ({
    date: format(parseISO(d.date), "dd MMM"),
    [isAr ? "مشاهدات" : "Views"]: d.views,
    [isAr ? "زوار فريدون" : "Unique"]: d.unique,
  })) ?? [];

  const deviceChartData = (data?.devices ?? []).map((d) => ({
    name: d.device === "mobile" ? (isAr ? "موبايل" : "Mobile")
        : d.device === "tablet" ? (isAr ? "تابلت" : "Tablet")
        : (isAr ? "كمبيوتر" : "Desktop"),
    value: d.count,
    color: DEVICE_COLORS[d.device ?? "desktop"] ?? "#888",
  }));

  const clicksChartData = (data?.topClicks ?? []).map((c) => {
    const label = c.element ? (ELEMENT_LABELS[c.element]?.[isAr ? "ar" : "en"] ?? c.element) : "—";
    return { name: label, value: c.count };
  });

  return (
    <div className="space-y-6">
      <div className={`flex items-center justify-between flex-wrap gap-3`}>
        <div>
          <h1 className="text-2xl font-bold">{isAr ? "فحص الزيارات" : "Traffic Analytics"}</h1>
          <p className="text-muted-foreground text-sm">{isAr ? "إحصائيات الزوار وحركة المرور في الموقع" : "Visitor and page view statistics"}</p>
        </div>
        <div className={`flex gap-2`}>
          {PRESETS.map((p) => (
            <Button key={p.days} variant={days === p.days ? "default" : "outline"} size="sm" onClick={() => setDays(p.days)}>
              {isAr ? p.label : p.labelEn}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : isError ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">{isAr ? "تعذّر تحميل البيانات" : "Failed to load data"}</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard icon={Eye} label={isAr ? `إجمالي المشاهدات (${days}ي)` : `Total Views (${days}d)`} value={data!.summary.totalViews} />
            <StatCard icon={Users} label={isAr ? `زوار فريدون (${days}ي)` : `Unique Visitors (${days}d)`} value={data!.summary.uniqueVisitors} />
            <StatCard icon={TrendingUp} label={isAr ? "مشاهدات اليوم" : "Today's Views"} value={data!.summary.todayViews} />
            <StatCard icon={Calendar} label={isAr ? "زوار اليوم" : "Today's Unique"} value={data!.summary.todayUnique} />
            <StatCard
              icon={Clock}
              label={isAr ? "متوسط وقت الإقامة" : "Avg. Time on Page"}
              value={data!.avgTimeOnPage.seconds > 0 ? formatDuration(data!.avgTimeOnPage.seconds) : "—"}
              sub={data!.avgTimeOnPage.count > 0 ? (isAr ? `من ${data!.avgTimeOnPage.count} جلسة` : `from ${data!.avgTimeOnPage.count} sessions`) : undefined}
            />
            <StatCard
              icon={MousePointerClick}
              label={isAr ? "إجمالي النقرات" : "Total Clicks"}
              value={data!.topClicks.reduce((s, c) => s + c.count, 0)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isAr ? "الزيارات اليومية" : "Daily Traffic"}</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gUnique" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey={isAr ? "مشاهدات" : "Views"} stroke="hsl(var(--primary))" fill="url(#gViews)" strokeWidth={2} />
                    <Area type="monotone" dataKey={isAr ? "زوار فريدون" : "Unique"} stroke="#22c55e" fill="url(#gUnique)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Button Clicks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-primary" />
                {isAr ? "نقرات أزرار الصفحة الرئيسية" : "Landing Page Button Clicks"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clicksChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{isAr ? "لا توجد بيانات بعد" : "No click data yet"}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={clicksChartData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                      <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name={isAr ? "نقرات" : "Clicks"} background={{ fill: "transparent" }} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {clicksChartData.map((c, i) => {
                      const total = clicksChartData.reduce((s, x) => s + x.value, 0);
                      const pct = total > 0 ? Math.round((c.value / total) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground truncate max-w-[160px]">{c.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-medium">{c.value.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{isAr ? "أكثر الصفحات زيارةً" : "Top Pages"}</CardTitle></CardHeader>
              <CardContent>
                {data!.topPages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد بيانات" : "No data"}</p>
                ) : (
                  <div className="space-y-2">
                    {data!.topPages.map((p) => (
                      <div key={p.page} className={`flex items-center justify-between gap-2 text-sm`}>
                        <span className="truncate text-muted-foreground font-mono text-xs">{p.page}</span>
                        <div className={`flex gap-3 shrink-0`}>
                          <span className="font-medium">{p.views.toLocaleString()}</span>
                          <span className="text-muted-foreground text-xs">{p.unique} {isAr ? "فريد" : "uniq"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{isAr ? "مصادر الزيارات" : "Top Referrers"}</CardTitle></CardHeader>
              <CardContent>
                {data!.topReferrers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد إحالات بعد" : "No referrers yet"}</p>
                ) : (
                  <div className="space-y-2">
                    {data!.topReferrers.map((r, i) => (
                      <div key={i} className={`flex items-center justify-between gap-2 text-sm`}>
                        <span className="truncate text-muted-foreground text-xs">{r.referrer ?? "—"}</span>
                        <span className="font-medium shrink-0">{r.count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{isAr ? "نوع الجهاز" : "Device Types"}</CardTitle></CardHeader>
              <CardContent>
                {deviceChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{isAr ? "لا توجد بيانات" : "No data"}</p>
                ) : (
                  <div className="space-y-3">
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={deviceChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                          {deviceChartData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                        <Tooltip formatter={(v: number) => v.toLocaleString()} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5">
                      {deviceChartData.map((d) => (
                        <div key={d.name} className={`flex items-center justify-between text-sm`}>
                          <div className={`flex items-center gap-1.5`}>
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                            <span className="text-muted-foreground">{d.name}</span>
                          </div>
                          <span className="font-medium">{d.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isAr ? "آخر الزيارات" : "Recent Visitors"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b text-muted-foreground text-xs ${isAr ? "text-right" : "text-left"}`}>
                      <th className="px-4 py-2.5 font-medium">{isAr ? "الصفحة" : "Page"}</th>
                      <th className="px-4 py-2.5 font-medium">{isAr ? "عنوان IP" : "IP Address"}</th>
                      <th className="px-4 py-2.5 font-medium">{isAr ? "الجهاز" : "Device"}</th>
                      <th className="px-4 py-2.5 font-medium">{isAr ? "اللغة" : "Language"}</th>
                      <th className="px-4 py-2.5 font-medium">{isAr ? "المصدر" : "Referrer"}</th>
                      <th className="px-4 py-2.5 font-medium">{isAr ? "الوقت" : "Time"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.recentVisitors.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground">{isAr ? "لا توجد زيارات بعد" : "No visits yet"}</td>
                      </tr>
                    ) : (
                      data!.recentVisitors.map((v, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{v.page}</td>
                          <td className="px-4 py-2.5 font-mono text-xs">{v.ip ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <DeviceIcon device={v.device} />
                              <span className="text-xs capitalize text-muted-foreground">
                                {v.device === "mobile" ? (isAr ? "موبايل" : "Mobile")
                                  : v.device === "tablet" ? (isAr ? "تابلت" : "Tablet")
                                  : (isAr ? "كمبيوتر" : "Desktop")}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground uppercase">{v.language ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">{v.referrer || "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(v.visitedAt), "dd/MM HH:mm")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
