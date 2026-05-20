import { useGetPortalMe, useGetPortalApiKeys, useListPortalPlans } from "@workspace/api-client-react";
import {
  Zap, DollarSign, Wallet, CheckCircle2, Image, MessageSquare, Mic, Key,
  ArrowUpRight, Activity, MailWarning, RefreshCw, AlertTriangle, TrendingUp, Copy, Eye, EyeOff,
  Star, Film,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/authFetch";
import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { maskKey } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ── tiny helpers ─────────────────────────────────────────── */
function StatCard({
  label, value, sub, icon, iconBg, iconColor,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; iconBg: string; iconColor: string;
}) {
  return (
    <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0" style={{ background: iconBg }}>
        <span style={{ color: iconColor }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
        <p className="text-2xl font-black text-white leading-tight">{value}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{sub}</p>}
      </div>
    </div>
  );
}

function ServiceCard({
  label, icon, iconBg, iconColor, stats, href,
}: {
  label: string; icon: React.ReactNode; iconBg: string; iconColor: string;
  stats: { key: string; value: string; bold?: boolean }[]; href: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: iconBg }}>
          <span style={{ color: iconColor }}>{icon}</span>
        </div>
        <button
          onClick={() => navigate(href)}
          className="flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: "rgba(255,255,255,0.35)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#00FFE0")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
        >
          View <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
      <p className="font-bold text-white text-sm">{label}</p>
      <div className="space-y-1.5">
        {stats.map((s) => (
          <div key={s.key} className="flex items-center justify-between text-xs">
            <span style={{ color: "rgba(255,255,255,0.4)" }}>{s.key}</span>
            <span className={s.bold ? "font-bold text-white" : "text-white"}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── main component ───────────────────────────────────────── */
export default function PortalDashboard() {
  const { data: me, isLoading: meLoading, isError: meError } = useGetPortalMe();
  const { data: apiKeys, isLoading: keysLoading, isError: keysError } = useGetPortalApiKeys();
  const { data: plans } = useListPortalPlans();
  const { toast } = useToast();
  const navigate = useNavigate();

  const myApiKey = apiKeys?.[0];
  const myPlan = myApiKey?.planId ? plans?.find((p) => p.id === myApiKey.planId) : null;

  const [copiedMap, setCopiedMap] = useState<Record<number, boolean>>({});
  const [revealedMap, setRevealedMap] = useState<Record<number, boolean>>({});
  const [revealedKeysMap, setRevealedKeysMap] = useState<Record<number, string>>({});
  const [revealingMap, setRevealingMap] = useState<Record<number, boolean>>({});
  const [resendingVerification, setResendingVerification] = useState(false);
  const [liveBlip, setLiveBlip] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setLiveBlip((v) => !v), 1200);
    return () => clearInterval(t);
  }, []);

  const currentBalance = me?.totalCreditsBalance ?? 0;
  const subscriptionCredit = (me as { subscriptionCreditBalance?: number } | undefined)?.subscriptionCreditBalance ?? 0;
  const topupCredit = (me as { topupCreditBalance?: number } | undefined)?.topupCreditBalance ?? 0;
  const periodEndRaw = (me?.user as { currentPeriodEnd?: string | null } | undefined)?.currentPeriodEnd ?? null;
  const periodEndMs = periodEndRaw ? new Date(periodEndRaw).getTime() : null;
  const subscriptionExpired = periodEndMs != null && periodEndMs <= Date.now();
  const subscriptionDaysLeft = periodEndMs != null && !subscriptionExpired ? Math.ceil((periodEndMs - Date.now()) / 86400000) : null;
  const planMonthlyCredits = myPlan?.monthlyCredits ?? 0;
  const showLowCreditWarning = !meLoading && planMonthlyCredits > 0 && currentBalance < planMonthlyCredits * 0.2 && currentBalance > 0;
  const showEmailVerificationBanner = !meLoading && me?.user && !(me.user as { emailVerified?: boolean }).emailVerified;

  const { data: usage30d, isLoading: usageLoading } = useQuery<{
    dailyUsage: Array<{ date: string; totalRequests: number; totalTokens: number; totalCostUsd: number }>;
    byModel: Array<{ model: string; totalRequests: number; totalTokens: number; totalCostUsd: number }>;
  }>({
    queryKey: ["portal-usage-dashboard-30"],
    queryFn: async () => {
      const res = await authFetch(`/api/portal/usage?days=30&page=1&limit=1`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: recentLogs } = useQuery<{
    logs: Array<{ id: number; model: string; inputTokens: number; outputTokens: number; costUsd: number; createdAt: string; statusCode: number }>;
  }>({
    queryKey: ["portal-recent-logs"],
    queryFn: async () => {
      const res = await authFetch(`/api/portal/logs?page=1&limit=6`);
      if (!res.ok) return { logs: [] };
      return res.json();
    },
    refetchInterval: 15000,
  });

  const copyToClipboard = (id: number, keyPrefix: string) => {
    const text = revealedKeysMap[id] ?? keyPrefix.replace(/\.\.\.$/, "");
    navigator.clipboard.writeText(text);
    setCopiedMap(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setCopiedMap(prev => ({ ...prev, [id]: false })), 2000);
    toast({ title: revealedKeysMap[id] ? "Copied API key" : "Copied key prefix" });
  };

  const toggleReveal = async (id: number) => {
    if (revealedMap[id]) {
      setRevealedMap(prev => ({ ...prev, [id]: false }));
      return;
    }
    if (revealedKeysMap[id]) {
      setRevealedMap(prev => ({ ...prev, [id]: true }));
      return;
    }
    setRevealingMap(prev => ({ ...prev, [id]: true }));
    try {
      const res = await authFetch(`/api/portal/api-keys/${id}/reveal`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reveal key");
      setRevealedKeysMap(prev => ({ ...prev, [id]: data.fullKey }));
      setRevealedMap(prev => ({ ...prev, [id]: true }));
    } catch (e: unknown) {
      toast({ title: "Could not reveal key", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setRevealingMap(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleResendVerification = async () => {
    if (!me?.user?.email) return;
    setResendingVerification(true);
    try {
      const res = await authFetch("/api/portal/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: me.user.email }),
      });
      if (res.ok) toast({ title: "Verification email sent" });
      else toast({ title: "Failed to send email", variant: "destructive" });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setResendingVerification(false);
    }
  };

  const totalRequests = me?.totalRequestsThisMonth ?? 0;
  const totalTokens = me?.totalTokensThisMonth ?? 0;
  const totalCost30d = (usage30d?.dailyUsage ?? []).reduce((s, d) => s + d.totalCostUsd, 0);

  const byModel = usage30d?.byModel ?? [];
  const textStats = byModel.filter((m) => !m.model.includes("imagen") && !m.model.includes("veo"));
  const imageStats = byModel.filter((m) => m.model.includes("imagen"));
  const videoStats = byModel.filter((m) => m.model.includes("veo"));
  const textRequests = textStats.reduce((s, m) => s + m.totalRequests, 0);
  const textTokens = textStats.reduce((s, m) => s + m.totalTokens, 0);
  const textCost = textStats.reduce((s, m) => s + m.totalCostUsd, 0);
  const imageRequests = imageStats.reduce((s, m) => s + m.totalRequests, 0);
  const imageCost = imageStats.reduce((s, m) => s + m.totalCostUsd, 0);
  const videoRequests = videoStats.reduce((s, m) => s + m.totalRequests, 0);
  const videoCost = videoStats.reduce((s, m) => s + m.totalCostUsd, 0);

  const axisTickStyle = { fill: "rgba(255,255,255,0.3)", fontSize: 10 };
  const tooltipStyle = { backgroundColor: "#1a1a28", borderColor: "rgba(255,255,255,0.1)", borderRadius: 10 };

  return (
    <div className="space-y-8 pb-8" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white" style={{ fontFamily: "'Space Mono', monospace" }}>Overview</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Multi-service usage dashboard</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.2)" }}>
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "#00C896", boxShadow: liveBlip ? "0 0 6px #00C896" : "none", transition: "box-shadow 0.3s" }}
          />
          <span className="text-xs font-bold" style={{ color: "#00C896" }}>Live Updates</span>
        </div>
      </div>

      {/* ── Banners ── */}
      {showEmailVerificationBanner && (
        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
          <MailWarning className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#facc15" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#facc15" }}>Verify your email address</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(250,204,21,0.7)" }}>
              A verification link was sent to <strong>{me?.user.email}</strong>. Verify your email to secure your account.
            </p>
          </div>
          <button
            onClick={handleResendVerification}
            disabled={resendingVerification}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={{ background: "rgba(234,179,8,0.15)", color: "#facc15", border: "1px solid rgba(234,179,8,0.2)" }}
          >
            {resendingVerification ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Resend"}
          </button>
        </div>
      )}
      {showLowCreditWarning && (
        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#f87171" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#f87171" }}>Low credit balance</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(248,113,113,0.7)" }}>
              Your balance is <strong>${currentBalance.toFixed(4)}</strong> — less than 20% of your plan's monthly credits.
            </p>
          </div>
        </div>
      )}
      {(meError || keysError) && (
        <div className="p-4 rounded-xl text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          Failed to load account data. Please refresh the page.
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Requests"
          value={meLoading ? "—" : totalRequests.toLocaleString()}
          sub="This month"
          icon={<Zap className="h-5 w-5" />}
          iconBg="rgba(99,102,241,0.2)"
          iconColor="#818cf8"
        />
        <StatCard
          label="Total Spend"
          value={usageLoading ? "—" : `$${totalCost30d.toFixed(4)}`}
          sub="Last 30 days"
          icon={<DollarSign className="h-5 w-5" />}
          iconBg="rgba(0,200,150,0.15)"
          iconColor="#00C896"
        />
        <StatCard
          label="Wallet Balance"
          value={meLoading ? "—" : `$${currentBalance.toFixed(4)}`}
          sub={
            subscriptionExpired ? "Subscription expired" :
            subscriptionDaysLeft != null ? `${subscriptionDaysLeft} days left` :
            "Credits available"
          }
          icon={<Wallet className="h-5 w-5" />}
          iconBg="rgba(79,70,229,0.2)"
          iconColor="#a78bfa"
        />
        <StatCard
          label="Top-up Credit"
          value={meLoading ? "—" : `$${topupCredit.toFixed(4)}`}
          sub="Works on all models"
          icon={<TrendingUp className="h-5 w-5" />}
          iconBg="rgba(245,158,11,0.15)"
          iconColor="#fbbf24"
        />
      </div>

      {/* ── Service Usage ── */}
      <div>
        <p className="text-base font-bold text-white mb-4">Service Usage</p>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <ServiceCard
            label="LLM API"
            icon={<MessageSquare className="h-4 w-4" />}
            iconBg="rgba(0,200,150,0.15)"
            iconColor="#00C896"
            href="/portal/usage"
            stats={[
              { key: "Total tokens", value: textTokens.toLocaleString() },
              { key: "Requests", value: textRequests.toLocaleString() },
              { key: "Total cost", value: `$${textCost.toFixed(4)}`, bold: true },
            ]}
          />
          <ServiceCard
            label="Image Generation"
            icon={<Image className="h-4 w-4" />}
            iconBg="rgba(192,32,184,0.2)"
            iconColor="#e879f9"
            href="/portal/usage"
            stats={[
              { key: "Images generated", value: imageRequests.toLocaleString() },
              { key: "Total cost", value: `$${imageCost.toFixed(4)}`, bold: true },
            ]}
          />
          <ServiceCard
            label="Video Generation"
            icon={<Film className="h-4 w-4" />}
            iconBg="rgba(0,255,224,0.12)"
            iconColor="#00FFE0"
            href="/portal/usage"
            stats={[
              { key: "Videos generated", value: videoRequests.toLocaleString() },
              { key: "Total cost", value: `$${videoCost.toFixed(4)}`, bold: true },
            ]}
          />
          <ServiceCard
            label="All Models"
            icon={<Zap className="h-4 w-4" />}
            iconBg="rgba(99,102,241,0.2)"
            iconColor="#818cf8"
            href="/portal/usage"
            stats={[
              { key: "Total tokens", value: totalTokens.toLocaleString() },
              { key: "Total requests", value: totalRequests.toLocaleString() },
              { key: "Total cost", value: `$${totalCost30d.toFixed(4)}`, bold: true },
            ]}
          />
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Daily Requests */}
        <div className="rounded-2xl p-5" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="font-bold text-white text-sm">Daily API Requests</p>
          <p className="text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>All services combined • Last 30 days</p>
          <div className="h-[160px] w-full">
            {!usageLoading && (usage30d?.dailyUsage?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usage30d!.dailyUsage} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradReq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axisTickStyle}
                    tickFormatter={(v) => { try { return format(new Date(v), "M/d") } catch { return v } }} />
                  <YAxis axisLine={false} tickLine={false} tick={axisTickStyle} />
                  <RechartsTooltip contentStyle={tooltipStyle}
                    labelFormatter={(v) => { try { return format(new Date(v), "MMM dd, yyyy") } catch { return v } }}
                    formatter={(v: number) => [v.toLocaleString(), "Requests"]} />
                  <Area type="monotone" dataKey="totalRequests" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#gradReq)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
                No usage data yet
              </div>
            )}
          </div>
        </div>

        {/* Daily Spend */}
        <div className="rounded-2xl p-5" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p className="font-bold text-white text-sm">Daily Spend (USD)</p>
          <p className="text-[11px] mb-4" style={{ color: "rgba(255,255,255,0.3)" }}>All services combined • Last 30 days</p>
          <div className="h-[160px] w-full">
            {!usageLoading && (usage30d?.dailyUsage?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={usage30d!.dailyUsage} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00C896" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#00C896" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={axisTickStyle}
                    tickFormatter={(v) => { try { return format(new Date(v), "M/d") } catch { return v } }} />
                  <YAxis axisLine={false} tickLine={false} tick={axisTickStyle}
                    tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                  <RechartsTooltip contentStyle={tooltipStyle}
                    labelFormatter={(v) => { try { return format(new Date(v), "MMM dd, yyyy") } catch { return v } }}
                    formatter={(v: number) => [`$${v.toFixed(4)}`, "Cost"]} />
                  <Area type="monotone" dataKey="totalCostUsd" stroke="#00C896" strokeWidth={2} fillOpacity={1} fill="url(#gradCost)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
                No spend data yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── API Key + Recent Activity ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* API Key */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4" style={{ color: "#818cf8" }} />
            <p className="font-bold text-white text-sm">Your API Keys</p>
          </div>
          {keysLoading ? (
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Loading keys…</p>
          ) : !apiKeys?.length ? (
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>No API keys found. Contact an administrator.</p>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div key={key.id} className="rounded-xl p-4 space-y-3" style={{ background: "#0a0a14", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{key.name || "Default Key"}</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: key.isActive ? "rgba(0,200,150,0.12)" : "rgba(255,255,255,0.08)",
                        color: key.isActive ? "#00C896" : "rgba(255,255,255,0.4)",
                      }}
                    >
                      {key.isActive ? "Active" : "Revoked"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs font-mono break-all select-all"
                      style={{ background: "#111118", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      {revealedMap[key.id] && revealedKeysMap[key.id]
                        ? revealedKeysMap[key.id]
                        : maskKey(undefined, key.keyPrefix, true)}
                    </code>
                    <button onClick={() => toggleReveal(key.id)} disabled={!!revealingMap[key.id]} className="p-2 rounded-lg transition-colors shrink-0 mt-0.5"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
                      {revealingMap[key.id]
                        ? <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin block" />
                        : revealedMap[key.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    <button onClick={() => copyToClipboard(key.id, key.keyPrefix)} className="p-2 rounded-lg transition-colors shrink-0 mt-0.5"
                      style={{ color: "rgba(255,255,255,0.35)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}>
                      {copiedMap[key.id] ? <CheckCircle2 className="h-4 w-4" style={{ color: "#00C896" }} /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                    <span>Balance: ${key.creditBalance.toLocaleString()}</span>
                    <span>Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}</span>
                  </div>
                  {key.planId && (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                      <Star className="h-3 w-3" style={{ color: "#fbbf24" }} />
                      Plan: <span className="text-white font-medium ml-0.5">{plans?.find((p) => p.id === key.planId)?.name ?? `#${key.planId}`}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent API Activity */}
        <div className="rounded-2xl p-5 space-y-4" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" style={{ color: "#00C896" }} />
              <p className="font-bold text-white text-sm">Recent API Activity</p>
            </div>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>Real-time log stream</span>
          </div>
          {!recentLogs?.logs?.length ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: "rgba(255,255,255,0.2)" }}>
              <Activity className="h-8 w-8 opacity-30" />
              <p className="text-xs">No API activity yet</p>
              <p className="text-[10px]">Make your first request to see it here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLogs.logs.map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "#0a0a14", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: log.statusCode < 300 ? "#00C896" : "#f87171" }}
                  />
                  <span className="flex-1 text-xs font-mono truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{log.model}</span>
                  <span className="text-[10px] shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                    ${log.costUsd.toFixed(5)}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => navigate("/portal/logs")}
            className="w-full py-2 rounded-xl text-xs font-medium transition-all"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#00FFE0")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
          >
            View all logs →
          </button>
        </div>
      </div>

    </div>
  );
}
