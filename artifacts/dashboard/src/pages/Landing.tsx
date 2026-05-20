import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import {
  Zap, ArrowRight, CheckCircle2, Globe, Shield,
  BarChart3, Key, CreditCard, Lock, Users, Sparkles,
  ChevronRight, Languages, Loader2, Moon, Sun,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trackClick } from "@/hooks/useEventTracker";
import { useTheme } from "@/lib/theme";

interface Plan {
  id: number;
  name: string;
  description: string | null;
  monthlyCredits: string;
  rpm: number;
  maxApiKeys: number;
  modelsAllowed: string[];
  priceUsd: string;
  isActive: boolean;
}

const GATEWAY_BASE = window.location.origin;

const CODE_SAMPLES: Record<string, string> = {
  python: `import requests

response = requests.post(
    "${GATEWAY_BASE}/v1/chat/completions",
    headers={
        "Authorization": "Bearer sk-xxxxxxxxxxxxxxxx",
        "Content-Type": "application/json",
    },
    json={
        "model": "gemini-2.5-pro",
        "messages": [{"role": "user", "content": "Hello"}],
        "stream": False
    }
)
print(response.json()["choices"][0]["message"]["content"])`,

  javascript: `const response = await fetch(
  "${GATEWAY_BASE}/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer sk-xxxxxxxxxxxxxxxx",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "Hello" }],
    })
  }
);
const data = await response.json();
console.log(data.choices[0].message.content);`,

  curl: `curl -X POST ${GATEWAY_BASE}/v1/chat/completions \\
  -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-2.5-pro",
    "messages": [{"role":"user","content":"Hello"}]
  }'`,
};

const FEATURE_ICONS = [Key, Shield, BarChart3, CreditCard, Lock, Users];

function gridClass(count: number): string {
  if (count === 1) return "max-w-sm mx-auto";
  if (count === 2) return "md:grid-cols-2 max-w-2xl mx-auto";
  if (count === 3) return "md:grid-cols-3";
  if (count === 4) return "md:grid-cols-2 lg:grid-cols-4";
  return "md:grid-cols-2 lg:grid-cols-3";
}

function isFeaturedPlan(idx: number, total: number): boolean {
  if (total === 1) return true;
  return idx === Math.floor(total / 2);
}

function buildFeatures(plan: Plan, isAr: boolean): { icon: string; label: string }[] {
  const price = parseFloat(plan.priceUsd);
  const credits = parseFloat(plan.monthlyCredits);
  const items: { icon: string; label: string }[] = [];

  if (credits >= 1000) {
    items.push({ icon: "💰", label: isAr ? `${(credits / 1000).toLocaleString()}K رصيد/شهرياً` : `${(credits / 1000).toLocaleString()}K credits/month` });
  } else {
    items.push({ icon: "💰", label: isAr ? `${credits.toLocaleString()} رصيد/شهرياً` : `${credits.toLocaleString()} credits/month` });
  }

  items.push({ icon: "⚡", label: isAr ? `${plan.rpm.toLocaleString()} طلب/دقيقة` : `${plan.rpm.toLocaleString()} req/min` });

  const modelCount = plan.modelsAllowed.length;
  items.push({ icon: "🤖", label: isAr ? (modelCount > 0 ? `${modelCount} نموذج` : "جميع النماذج") : (modelCount > 0 ? `${modelCount} AI models` : "All models") });
  items.push({ icon: "🔑", label: isAr ? `${plan.maxApiKeys} ${plan.maxApiKeys === 1 ? "مفتاح API" : "مفاتيح API"}` : `${plan.maxApiKeys} API key${plan.maxApiKeys !== 1 ? "s" : ""}` });

  if (price === 0) {
    items.push({ icon: "📊", label: isAr ? "لوحة تحكم أساسية" : "Basic dashboard" });
    items.push({ icon: "🌐", label: isAr ? "دعم المجتمع" : "Community support" });
  } else if (price <= 50) {
    items.push({ icon: "📊", label: isAr ? "تحليلات متقدمة" : "Advanced analytics" });
    items.push({ icon: "📧", label: isAr ? "دعم عبر البريد" : "Email support" });
    items.push({ icon: "🔔", label: isAr ? "تنبيهات الرصيد" : "Low credit alerts" });
  } else {
    items.push({ icon: "📊", label: isAr ? "تحليلات مخصصة" : "Custom analytics" });
    items.push({ icon: "🎯", label: isAr ? "SLA 99.9% وقت التشغيل" : "99.9% uptime SLA" });
    items.push({ icon: "🛡️", label: isAr ? "دعم مخصص 24/7" : "24/7 dedicated support" });
  }

  return items;
}

interface PricingGridProps {
  plans: Plan[];
  isAr: boolean;
  navigate: (path: string) => void;
  t: (key: string) => string;
}

function PricingGrid({ plans, isAr, navigate, t }: PricingGridProps) {
  return (
    <div className={`grid grid-cols-1 gap-6 items-stretch ${gridClass(plans.length)}`}>
      {plans.map((plan, idx) => {
        const featured = isFeaturedPlan(idx, plans.length);
        const price = parseFloat(plan.priceUsd);
        const isFree = price === 0;
        const features = buildFeatures(plan, isAr);

        return (
          <div
            key={plan.id}
            className={`flex flex-col rounded-2xl overflow-hidden relative transition-all duration-200 ${featured ? "scale-[1.03]" : ""}`}
            style={{
              background: featured ? "#0a0a0f" : "#111118",
              border: featured ? "2px solid #00FFE0" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: featured ? "0 0 60px rgba(0,255,224,0.15)" : "none",
            }}
          >
            {featured && (
              <div className="absolute top-0 inset-x-0 flex justify-center">
                <span
                  className="rounded-none rounded-b-md px-4 py-0.5 text-xs font-bold tracking-widest uppercase"
                  style={{ background: "#00FFE0", color: "#050508", fontFamily: "'Space Mono', monospace" }}
                >
                  {t("landing.plans.popular")}
                </span>
              </div>
            )}

            <div className={`p-7 ${featured ? "pt-9" : ""}`}>
              <h3
                className="font-bold text-xl mb-1"
                style={{ color: "#fff", fontFamily: "'Space Mono', monospace" }}
              >
                {plan.name}
              </h3>
              {plan.description && (
                <p className="text-sm mb-5 leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {plan.description}
                </p>
              )}
              <div className="flex items-end gap-1 mb-6">
                {isFree ? (
                  <span className="text-4xl font-extrabold" style={{ color: featured ? "#00FFE0" : "white", fontFamily: "'Space Mono', monospace" }}>
                    {isAr ? "مجاني" : "Free"}
                  </span>
                ) : (
                  <>
                    <span className="text-4xl font-extrabold" style={{ color: featured ? "#00FFE0" : "white", fontFamily: "'Space Mono', monospace" }}>
                      ${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}
                    </span>
                    <span className="mb-1.5 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {isAr ? "/شهر" : "/mo"}
                    </span>
                  </>
                )}
              </div>
              <button
                className="w-full py-3 rounded-full font-bold text-sm transition-all hover:opacity-90"
                style={featured
                  ? { background: "#00FFE0", color: "#050508", fontFamily: "'Space Mono', monospace", boxShadow: "0 0 30px rgba(0,255,224,0.3)" }
                  : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }
                }
                onClick={() => navigate("/signup")}
              >
                {t("landing.plans.cta")}
              </button>
            </div>

            <div className="flex-1 p-7 space-y-3" style={{ borderTop: featured ? "1px solid rgba(0,255,224,0.2)" : "1px solid rgba(255,255,255,0.06)" }}>
              {features.map((f) => (
                <div key={f.label} className="flex items-start gap-2.5 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
                  <span className="text-base leading-none mt-0.5 shrink-0">{f.icon}</span>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ALL_MODELS = [
  "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite",
  "gemini-3.1-pro-preview", "gemini-3.1-flash-lite-preview",
  "gemini-3.0-flash-preview", "grok-4.20", "grok-4.1-thinking",
  "deepseek-v3.2", "kimi-k2", "minimax-m2", "gemma-4-26b",
  "imagen-4.0-generate-001", "imagen-3.0-generate-002",
  "veo-3.1-generate-001", "veo-3.0-generate-001",
  "mistral-small", "glm-5", "whisper-1", "tts-1",
  "gemini-2.5-pro", "gemini-2.5-flash", "grok-4.20", "deepseek-v3.2",
];


export default function Landing() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const isAr = i18n.language === "ar";
  const [activeCode, setActiveCode] = useState<"python" | "javascript" | "curl">("python");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const tickerRef = useRef<HTMLDivElement>(null);
  const title1Text = t("landing.hero.title1");

  const C = {
    pageBg:      isDark ? "#060610"   : "#f4f5f7",
    navBg:       "#0a0a0f",
    text:        isDark ? "#f0f0f5"   : "#050508",
    textMuted:   isDark ? "#9ca3af"   : "#6b7280",
    cardBg:      isDark ? "#111118"   : "white",
    cardBorder:  isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)",
    sectionAlt:  isDark ? "#0a0a0f"   : "white",
    gridLine:    isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)",
    featureCard: isDark ? "#0a0a0f"   : "#0a0a0f",
    pricingBg:   "#0a0a0f",
    statCard:    isDark ? "rgba(255,255,255,0.04)" : "white",
    statBorder:  isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    modelCard:   isDark ? "#0f0f18"   : "#fafafa",
    modelHeader: "#0a0a0f",
    modelText:   isDark ? "rgba(255,255,255,0.65)" : "#374151",
    codeBg:      "#0d0d14",
    footerBg:    "#0a0a0f",
  };

  useEffect(() => {
    fetch("/api/public/plans")
      .then((r) => r.json())
      .then((data: Plan[]) => setPlans(data.filter((p) => p.isActive)))
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  const switchLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang;
  };

  const features = (t("landing.features.items", { returnObjects: true }) as { title: string; desc: string }[]);
  const steps = (t("landing.howItWorks.steps", { returnObjects: true }) as { num: string; title: string; desc: string }[]);
  const textModels = (t("landing.models.textModels", { returnObjects: true }) as string[]);
  const imageModels = (t("landing.models.imageModels", { returnObjects: true }) as string[]);
  const videoModels = (t("landing.models.videoModels", { returnObjects: true }) as string[]);

  const stats = [
    { value: t("landing.hero.stat1Value"), label: t("landing.hero.stat1Label") },
    { value: t("landing.hero.stat2Value"), label: t("landing.hero.stat2Label") },
    { value: t("landing.hero.stat3Value"), label: t("landing.hero.stat3Label") },
    { value: t("landing.hero.stat4Value"), label: t("landing.hero.stat4Label") },
  ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: C.pageBg,
        color: C.text,
        fontFamily: "'DM Sans', sans-serif",
        transition: "background 0.3s, color 0.3s",
      }}
    >
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: ticker 28s linear infinite;
        }
        .ticker-track:hover { animation-play-state: paused; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease both; }
        .fade-up-2 { animation: fadeUp 0.7s 0.15s ease both; }
        .fade-up-3 { animation: fadeUp 0.7s 0.3s ease both; }
        .fade-up-4 { animation: fadeUp 0.7s 0.45s ease both; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .cursor-blink { animation: blink 0.85s step-start infinite; }
      `}</style>

      {/* ─── Floating Navbar ─── */}
      <div className="sticky top-0 z-50 flex justify-center px-4 pt-4">
        <header
          className="w-full max-w-6xl rounded-2xl flex items-center justify-between px-6 h-14 gap-4"
          style={{
            background: "#0a0a0f",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
          }}
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="rounded-lg p-1.5" style={{ background: "linear-gradient(135deg,#00FFE0,#00b3a0)" }}>
              <Zap className="h-4 w-4" style={{ color: "#050508" }} />
            </div>
            <span className="font-bold text-base text-white" style={{ fontFamily: "'Space Mono', monospace" }}>
              AI Gateway
            </span>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>
            {(["features", "models", "howItWorks", "pricing"] as const).map((key) => (
              <a
                key={key}
                href={`#${key}`}
                className="hover:text-white transition-colors"
              >
                {t(`landing.nav.${key}`)}
              </a>
            ))}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-1.5 rounded-lg transition-all hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.45)" }}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-lg transition-colors" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <Languages className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isAr ? "start" : "end"}>
                <DropdownMenuItem onClick={() => switchLang("ar")} className={i18n.language === "ar" ? "font-bold" : ""}>🇩🇿 العربية</DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchLang("en")} className={i18n.language === "en" ? "font-bold" : ""}>🇺🇸 English</DropdownMenuItem>
                <DropdownMenuItem onClick={() => switchLang("fr")} className={i18n.language === "fr" ? "font-bold" : ""}>🇫🇷 Français</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              onClick={() => { trackClick("nav_login"); navigate("/login"); }}
              className="hidden sm:flex px-4 py-1.5 text-sm font-medium rounded-full transition-colors"
              style={{ color: "rgba(255,255,255,0.55)", background: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
            >
              {t("landing.nav.signIn")}
            </button>
            <button
              onClick={() => { trackClick("nav_signup"); navigate("/signup"); }}
              className="px-5 py-1.5 rounded-full text-sm font-bold transition-all hover:opacity-90"
              style={{
                background: "#00FFE0",
                color: "#050508",
                fontFamily: "'Space Mono', monospace",
                boxShadow: "0 0 20px rgba(0,255,224,0.3)",
              }}
            >
              {t("landing.nav.getStarted")}
            </button>
          </div>
        </header>
      </div>

      {/* ─── Hero ─── */}
      <section
        className="relative overflow-hidden pt-16 pb-12 px-4"
        style={{
          backgroundImage: `linear-gradient(${C.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${C.gridLine} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      >
        <div className="max-w-5xl mx-auto text-center">

          {/* Status badge */}
          <div className="fade-up inline-flex items-center gap-2.5 rounded-full px-5 py-2 mb-10" style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00C896", boxShadow: "0 0 8px #00C896" }} />
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: C.textMuted, fontFamily: "'Space Mono', monospace" }}>
              {isAr ? "النظام يعمل — بيتا" : "System Online — Beta"}
            </span>
          </div>

          {/* Huge title — full text in DOM immediately for LCP + SEO.
               CSS reveals line 1 with a short fade so the visual feel is preserved. */}
          <h1
            className="fade-up-2 font-black leading-none mb-8 select-none"
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: "clamp(2.8rem, 9vw, 7rem)",
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            {/* Line 1 — cyan stroke, full text visible immediately */}
            <span style={{ display: "block", WebkitTextStroke: "2px #00FFE0", color: "transparent" }}>
              {title1Text}
              <span className="cursor-blink">_</span>
            </span>
            {/* Line 2 — solid magenta */}
            <span style={{ display: "block", color: "#C020B8" }}>
              {t("landing.hero.title2")}
            </span>
          </h1>

          <p
            className="fade-up-3 text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed"
            style={{ color: C.textMuted }}
          >
            {t("landing.hero.subtitle")}
          </p>

          {/* CTAs */}
          <div className="fade-up-4 flex flex-wrap gap-4 justify-center mb-6">
            <button
              onClick={() => { trackClick("hero_signup"); navigate("/signup"); }}
              className="inline-flex items-center gap-2 font-bold px-10 py-4 rounded-full text-base transition-all hover:opacity-90"
              style={{
                background: "#050508",
                color: "#00FFE0",
                fontFamily: "'Space Mono', monospace",
                boxShadow: "0 0 40px rgba(0,255,224,0.3), 0 0 80px rgba(0,255,224,0.1)",
              }}
            >
              {t("landing.hero.cta")}
              {isAr ? <ArrowRight className="h-4 w-4 rotate-180" /> : <ArrowRight className="h-4 w-4" />}
            </button>
            <button
              onClick={() => { trackClick("hero_docs"); navigate("/portal/docs"); }}
              className="inline-flex items-center gap-2 font-medium px-10 py-4 rounded-full text-base transition-all"
              style={{
                background: "#FCF4FB",
                color: "#C020B8",
                border: "1.5px solid #E6A6E3",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f5e8f5"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#FCF4FB"; }}
            >
              {t("landing.hero.ctaSecondary")}
            </button>
          </div>
          <p className="text-sm mb-12" style={{ color: C.textMuted }}>{t("landing.hero.noCreditCard")}</p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
            {stats.map((s, i) => {
              const colors = ["#00FFE0", "#C020B8", "#4F46E5", "#f59e0b"];
              return (
                <div
                  key={s.label}
                  className="rounded-2xl p-6 transition-all"
                  style={{ background: C.statCard, border: `1px solid ${C.statBorder}`, boxShadow: isDark ? "none" : "0 2px 12px rgba(0,0,0,0.05)" }}
                >
                  <div className="text-3xl font-black mb-1" style={{ color: colors[i], fontFamily: "'Space Mono', monospace" }}>
                    {s.value}
                  </div>
                  <div className="text-sm" style={{ color: C.textMuted }}>{s.label}</div>
                </div>
              );
            })}
          </div>

          {/* Terminal code block */}
          <div
            className="rounded-2xl overflow-hidden text-left shadow-2xl"
            style={{ background: "#0d0d14", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {/* Terminal header bar */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ background: "#161622", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
                gateway@api ~ /v1/chat/completions
              </span>
              <div className="flex gap-1">
                {(["python", "javascript", "curl"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => { setActiveCode(lang); trackClick(`code_tab_${lang}`); }}
                    className="px-3 py-1 rounded-md text-xs font-bold transition-all"
                    style={{
                      background: activeCode === lang ? "#00FFE0" : "rgba(255,255,255,0.05)",
                      color: activeCode === lang ? "#050508" : "rgba(255,255,255,0.4)",
                      fontFamily: "'Space Mono', monospace",
                    }}
                  >
                    {lang === "javascript" ? "Node.js" : lang.charAt(0).toUpperCase() + lang.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-6 overflow-x-auto">
              <pre dir="ltr" className="text-sm leading-relaxed text-left" style={{ color: "#e2e8f0", fontFamily: "'Space Mono', monospace" }}>
                <code>{CODE_SAMPLES[activeCode]}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Model Ticker ─── */}
      <div
        className="overflow-hidden py-5"
        style={{ borderTop: "1px solid rgba(0,0,0,0.07)", borderBottom: "1px solid rgba(0,0,0,0.07)", background: "#0a0a0f" }}
      >
        <div className="ticker-track" ref={tickerRef}>
          {[...ALL_MODELS, ...ALL_MODELS].map((m, i) => (
            <span
              key={i}
              className="flex items-center gap-3 text-sm font-bold px-6 shrink-0"
              style={{ fontFamily: "'Space Mono', monospace", color: i % 6 === 0 ? "#00FFE0" : i % 6 === 3 ? "#C020B8" : "rgba(255,255,255,0.35)" }}
            >
              {m}
              <span style={{ color: "rgba(255,255,255,0.12)" }}>◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ─── Features ─── */}
      <section
        id="features"
        className="py-24 px-4"
        style={{
          backgroundImage: `linear-gradient(${C.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${C.gridLine} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#00C896", fontFamily: "'Space Mono', monospace" }}>
              {isAr ? "⟩ وحدات النظام" : "⟩ System Modules"}
            </p>
            <h2 className="text-3xl md:text-5xl font-black mb-4 uppercase" style={{ fontFamily: "'Space Mono', monospace", color: C.text }}>
              {t("landing.features.title")}
            </h2>
            <p className="max-w-2xl mx-auto text-lg" style={{ color: C.textMuted }}>
              {t("landing.features.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => {
              const Icon = FEATURE_ICONS[i] ?? Zap;
              const accents = ["#00FFE0", "#C020B8", "#4F46E5", "#00FFE0", "#C020B8", "#f59e0b"];
              const accent = accents[i] ?? "#00FFE0";
              return (
                <div
                  key={i}
                  className="group p-6 rounded-2xl transition-all duration-200 cursor-default"
                  style={{ background: "#0a0a0f", border: "1px solid rgba(255,255,255,0.07)" }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = `${accent}55`;
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 30px ${accent}15`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  }}
                >
                  <div className="rounded-xl p-3 w-fit mb-4" style={{ background: `${accent}18` }}>
                    <Icon className="h-6 w-6" style={{ color: accent }} />
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-base text-white" style={{ fontFamily: "'Space Mono', monospace" }}>
                      {f.title}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: `${accent}20`, color: accent, fontFamily: "'Space Mono', monospace" }}>
                      {isAr ? "نشط" : "LIVE"}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {f.desc}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-bold" style={{ color: accent, fontFamily: "'Space Mono', monospace" }}>
                    {isAr ? "الوصول إلى الوحدة" : "Access Module"} →
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Models ─── */}
      <section
        id="models"
        className="py-24 px-4"
        style={{ background: C.sectionAlt, borderTop: `1px solid ${C.cardBorder}` }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#C020B8", fontFamily: "'Space Mono', monospace" }}>
              {isAr ? "⟩ النماذج المدعومة" : "⟩ Supported Models"}
            </p>
            <h2 className="text-3xl md:text-5xl font-black mb-4 uppercase" style={{ fontFamily: "'Space Mono', monospace", color: C.text }}>
              {t("landing.models.title")}
            </h2>
            <p className="max-w-2xl mx-auto text-lg" style={{ color: C.textMuted }}>
              {t("landing.models.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { accent: "#4F46E5", icon: <Globe className="h-5 w-5" style={{ color: "#4F46E5" }} />, label: t("landing.models.text"), items: textModels, extra: isAr ? "و 33 نموذجاً آخر..." : "And 33 more..." },
              { accent: "#C020B8", icon: <Sparkles className="h-5 w-5" style={{ color: "#C020B8" }} />, label: t("landing.models.image"), items: imageModels, extra: null },
              { accent: "#00C896", icon: <Zap className="h-5 w-5" style={{ color: "#00C896" }} />, label: t("landing.models.video"), items: videoModels, extra: null },
            ].map((col, ci) => (
              <div
                key={ci}
                className="rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${C.cardBorder}`, background: C.modelCard }}
              >
                <div
                  className="px-6 py-4 flex items-center gap-3"
                  style={{ background: "#0a0a0f", borderBottom: `3px solid ${col.accent}` }}
                >
                  <div className="rounded-lg p-2" style={{ background: `${col.accent}22` }}>
                    {col.icon}
                  </div>
                  <h3 className="font-bold text-white" style={{ fontFamily: "'Space Mono', monospace" }}>
                    {col.label}
                  </h3>
                </div>
                <ul className="p-4 space-y-1">
                  {col.items.map((m) => (
                    <li
                      key={m}
                      className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg transition-colors"
                      style={{ color: C.modelText }}
                      onMouseEnter={e => { (e.currentTarget.style.background = `${col.accent}0a`); }}
                      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: col.accent }} />
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: "0.8rem" }}>{m}</span>
                    </li>
                  ))}
                  {col.extra && (
                    <li className="flex items-center gap-2 text-sm py-1.5 px-2" style={{ color: "#9ca3af" }}>
                      <ChevronRight className="h-4 w-4" />
                      <span>{col.extra}</span>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section
        id="howItWorks"
        className="py-24 px-4"
        style={{
          backgroundImage: `linear-gradient(${C.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${C.gridLine} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          borderTop: `1px solid ${C.cardBorder}`,
        }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#4F46E5", fontFamily: "'Space Mono', monospace" }}>
              {isAr ? "⟩ كيف يعمل" : "⟩ How It Works"}
            </p>
            <h2 className="text-3xl md:text-5xl font-black mb-4 uppercase" style={{ fontFamily: "'Space Mono', monospace", color: C.text }}>
              {t("landing.howItWorks.title")}
            </h2>
            <p className="text-lg" style={{ color: C.textMuted }}>{t("landing.howItWorks.subtitle")}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {steps.map((s, i) => {
              const stepColors = ["#00FFE0", "#C020B8", "#4F46E5"];
              const c = stepColors[i] ?? "#00FFE0";
              return (
                <div key={i} className="flex flex-col items-center text-center">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-black mb-6 transition-transform hover:scale-105"
                    style={{
                      background: "#0a0a0f",
                      border: `2px solid ${c}`,
                      color: c,
                      fontFamily: "'Space Mono', monospace",
                      boxShadow: `0 0 30px ${c}22`,
                    }}
                  >
                    {s.num}
                  </div>
                  <h3 className="font-bold text-xl mb-3" style={{ color: C.text, fontFamily: "'Space Mono', monospace" }}>
                    {s.title}
                  </h3>
                  <p className="leading-relaxed" style={{ color: C.textMuted }}>{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section
        id="pricing"
        className="py-24 px-4"
        style={{ background: "#0a0a0f", borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: "#00FFE0", fontFamily: "'Space Mono', monospace" }}>
              {isAr ? "⟩ الأسعار" : "⟩ Pricing"}
            </p>
            <h2 className="text-3xl md:text-5xl font-black mb-4 uppercase" style={{ fontFamily: "'Space Mono', monospace", color: "white" }}>
              {t("landing.plans.title")}
            </h2>
            <p className="text-lg" style={{ color: "rgba(255,255,255,0.45)" }}>
              {t("landing.plans.subtitle")}
            </p>
          </div>
          {plansLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#00FFE0" }} />
            </div>
          ) : plans.length === 0 ? (
            <p className="text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
              {isAr ? "لا توجد خطط متاحة حالياً." : "No plans available at the moment."}
            </p>
          ) : (
            <PricingGrid plans={plans} isAr={isAr} navigate={navigate} t={t} />
          )}
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section
        className="py-28 px-4 relative overflow-hidden"
        style={{
          background: C.pageBg,
          backgroundImage: `linear-gradient(${C.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${C.gridLine} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          borderTop: `1px solid ${C.cardBorder}`,
        }}
      >
        <div className="max-w-3xl mx-auto text-center relative">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-8"
            style={{ background: "#0a0a0f", border: "2px solid #00FFE0", boxShadow: "0 0 40px rgba(0,255,224,0.25)" }}
          >
            <Zap className="h-7 w-7" style={{ color: "#00FFE0" }} />
          </div>
          <h2
            className="font-black uppercase mb-2 leading-tight"
            style={{ fontFamily: "'Space Mono', monospace", fontSize: "clamp(2rem, 6vw, 4rem)", color: C.text }}
          >
            {isAr ? "جاهز للبدء؟" : "Ready to"}
          </h2>
          <h2
            className="font-black uppercase mb-8 leading-tight"
            style={{ fontFamily: "'Space Mono', monospace", fontSize: "clamp(2rem, 6vw, 4rem)", color: "#00FFE0", WebkitTextStroke: "2px #00FFE0" }}
          >
            {isAr ? "ابدأ الآن_" : "initialize?_"}
          </h2>
          <p className="text-lg mb-10 max-w-xl mx-auto" style={{ color: C.textMuted }}>
            {t("landing.cta.subtitle")}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => { trackClick("cta_signup"); navigate("/signup"); }}
              className="inline-flex items-center gap-2 font-bold px-12 py-4 rounded-full text-base transition-all hover:opacity-90"
              style={{
                background: "#050508",
                color: "#00FFE0",
                fontFamily: "'Space Mono', monospace",
                boxShadow: "0 0 40px rgba(0,255,224,0.25), 0 0 80px rgba(0,255,224,0.1)",
              }}
            >
              {t("landing.cta.button")}
              {isAr ? <ArrowRight className="h-4 w-4 rotate-180" /> : <ArrowRight className="h-4 w-4" />}
            </button>
            <button
              onClick={() => { trackClick("cta_login"); navigate("/login"); }}
              className="inline-flex items-center font-medium px-10 py-4 rounded-full text-base transition-all"
              style={{ background: "#FCF4FB", color: "#C020B8", border: "1.5px solid #E6A6E3" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f5e8f5"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#FCF4FB"; }}
            >
              {t("landing.cta.buttonSecondary")}
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer
        className="py-10 px-4"
        style={{ background: "#0a0a0f", borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col items-center md:items-start gap-2">
              <div className="flex items-center gap-2">
                <div className="rounded-lg p-1" style={{ background: "#00FFE0" }}>
                  <Zap className="h-3.5 w-3.5" style={{ color: "#050508" }} />
                </div>
                <span className="font-bold text-base text-white" style={{ fontFamily: "'Space Mono', monospace" }}>
                  AI Gateway
                </span>
              </div>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                {t("landing.footer.tagline")}
              </p>
            </div>
            <div className="flex flex-wrap gap-6 text-sm justify-center" style={{ color: "rgba(255,255,255,0.3)" }}>
              {[
                { label: t("landing.footer.portal"), path: "/login" },
                { label: t("landing.footer.admin"), path: "/admin/login" },
                { label: t("landing.nav.getStarted"), path: "/signup" },
                { label: isAr ? "الخصوصية" : "Privacy", path: "/privacy" },
                { label: isAr ? "الشروط" : "Terms", path: "/terms" },
              ].map(l => (
                <button
                  key={l.path}
                  onClick={() => navigate(l.path)}
                  className="hover:text-white transition-colors"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 pt-6 text-center text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.2)", fontFamily: "'Space Mono', monospace" }}>
            © {new Date().getFullYear()} AI Gateway. {isAr ? "جميع الحقوق محفوظة." : "All rights reserved."}
          </div>
        </div>
      </footer>
    </div>
  );
}
