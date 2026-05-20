import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { usePortalRegister } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, CheckCircle2, AlertCircle, Zap, ShieldCheck, ArrowLeft } from "lucide-react";
import i18n from "@/i18n";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.1z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C40.6 35.4 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/>
    </svg>
  );
}

interface ApiKeyPayload { keyPrefix: string; fullKey: string; creditBalance: number; planName: string; }

const REF_STORAGE_KEY = "ai_gw_ref_code";
const REF_STORAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readStoredRef(): string | null {
  try {
    const raw = localStorage.getItem(REF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code: string; savedAt: number };
    if (!parsed?.code || Date.now() - parsed.savedAt > REF_STORAGE_TTL_MS) { localStorage.removeItem(REF_STORAGE_KEY); return null; }
    return parsed.code;
  } catch { return null; }
}

export default function PortalSignup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const register = usePortalRegister();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isAr = i18n.language === "ar";

  const refFromUrl = useMemo(() => searchParams.get("ref"), [searchParams]);
  useEffect(() => {
    if (refFromUrl) {
      try { localStorage.setItem(REF_STORAGE_KEY, JSON.stringify({ code: refFromUrl, savedAt: Date.now() })); } catch { /* ignore */ }
    }
  }, [refFromUrl]);
  const activeRefCode = refFromUrl ?? readStoredRef();

  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [githubEnabled, setGithubEnabled] = useState(false);
  useEffect(() => {
    fetch(`${API_BASE}/api/portal/auth/google/config`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() as Promise<{ enabled: boolean }> : { enabled: false }))
      .then((d) => setGoogleEnabled(Boolean(d?.enabled)))
      .catch(() => setGoogleEnabled(false));
    fetch(`${API_BASE}/api/portal/auth/github/config`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() as Promise<{ enabled: boolean }> : { enabled: false }))
      .then((d) => setGithubEnabled(Boolean(d?.enabled)))
      .catch(() => setGithubEnabled(false));
  }, []);

  const startGoogleSignIn = () => {
    const qs = activeRefCode ? `?ref=${encodeURIComponent(activeRefCode)}` : "";
    window.location.href = `${API_BASE}/api/portal/auth/google${qs}`;
  };
  const startGitHubSignIn = () => {
    const qs = activeRefCode ? `?ref=${encodeURIComponent(activeRefCode)}` : "";
    window.location.href = `${API_BASE}/api/portal/auth/github${qs}`;
  };

  const signupSchema = z.object({
    name: z.string().min(2, isAr ? "الاسم يجب أن يكون حرفين على الأقل" : "Name must be at least 2 characters"),
    email: z.string().email(isAr ? "أدخل بريداً إلكترونياً صحيحاً" : "Please enter a valid email address"),
    password: z.string().min(8, t("auth.passwordMin")),
    confirmPassword: z.string(),
  }).refine((d) => d.password === d.confirmPassword, {
    message: t("auth.passwordMismatch"),
    path: ["confirmPassword"],
  });

  type SignupForm = z.infer<typeof signupSchema>;

  const [pendingUser, setPendingUser] = useState<import("@/lib/auth").AuthUser | null>(null);
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyPayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user?.role === "developer") navigate("/portal", { replace: true });
  }, [isAuthenticated, user, navigate]);

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  const copyKey = () => {
    if (!apiKeyInfo) return;
    navigator.clipboard.writeText(apiKeyInfo.fullKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: isAr ? "تم نسخ المفتاح — احفظه بأمان!" : "API key copied — store it safely!" });
  };

  const handleKeyDialogClose = () => { if (pendingUser) login(pendingUser); };

  const onSubmit = ({ name, email, password }: SignupForm) => {
    register.mutate(
      { data: { name, email, password, ...(activeRefCode ? { refCode: activeRefCode } : {}) } as never },
      {
        onSuccess: (res) => {
          try { localStorage.removeItem(REF_STORAGE_KEY); } catch { /* ignore */ }
          const payload = (res as typeof res & { apiKey?: ApiKeyPayload }).apiKey;
          if (payload) { setPendingUser(res.user); setApiKeyInfo(payload); }
          else { login(res.user); toast({ title: t("auth.registered"), description: isAr ? "مرحباً بك في AI Gateway." : "Welcome to AI Gateway." }); }
        },
        onError: (error) => {
          toast({ title: t("auth.registerFailed"), description: error.message || (isAr ? "حدث خطأ. يرجى المحاولة مجدداً." : "Something went wrong. Please try again."), variant: "destructive" });
        },
      }
    );
  };

  const pageBg = isDark ? "#060610" : "#f4f5f7";
  const gridLine = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
  const cardBg = "#111118";
  const inputBg = isDark ? "#0d0d18" : "#1a1a28";
  const labelColor = "rgba(255,255,255,0.55)";

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: pageBg,
        backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
        backgroundSize: "48px 48px",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Back link */}
      <div className="p-5">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-2 text-sm transition-colors"
          style={{ color: isDark ? "rgba(255,255,255,0.4)" : "#6b7280" }}
          onMouseEnter={e => (e.currentTarget.style.color = isDark ? "rgba(255,255,255,0.8)" : "#374151")}
          onMouseLeave={e => (e.currentTarget.style.color = isDark ? "rgba(255,255,255,0.4)" : "#6b7280")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{isAr ? "الصفحة الرئيسية" : "Back to home"}</span>
        </button>
      </div>

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">

          {/* Card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: cardBg, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 80px rgba(0,0,0,0.4)" }}
          >
            {/* Card header */}
            <div className="px-8 pt-8 pb-6 text-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
                style={{ background: "linear-gradient(135deg, rgba(0,255,224,0.2), rgba(192,32,184,0.2))", border: "1px solid rgba(0,255,224,0.3)", boxShadow: "0 0 40px rgba(0,255,224,0.15)" }}
              >
                <Zap className="h-6 w-6" style={{ color: "#00FFE0" }} />
              </div>
              <h1 className="text-2xl font-black text-white mb-1" style={{ fontFamily: "'Space Mono', monospace" }}>
                {t("auth.createAccount")}
              </h1>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                {isAr ? "ابدأ باستخدام Gemini وImagen وVeo في دقائق." : "Start using Gemini, Imagen & Veo in minutes."}
              </p>
              {activeRefCode && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(0,255,224,0.07)", border: "1px solid rgba(0,255,224,0.2)", color: "#00FFE0" }}>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {isAr
                    ? <span>دُعيت بكود <code className="font-mono font-bold">{activeRefCode}</code></span>
                    : <span>Invited with code <code className="font-mono font-bold">{activeRefCode}</code></span>
                  }
                </div>
              )}
            </div>

            {/* Social buttons */}
            {(googleEnabled || githubEnabled) && (
              <div className="px-8 pt-6 space-y-3">
                {googleEnabled && (
                  <button
                    type="button"
                    onClick={startGoogleSignIn}
                    data-testid="button-google-signup"
                    className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                    style={{ background: "white", color: "#1f1f1f", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
                  >
                    <GoogleIcon />
                    {isAr ? "إنشاء الحساب باستخدام Google" : "Sign up with Google"}
                  </button>
                )}
                {githubEnabled && (
                  <button
                    type="button"
                    onClick={startGitHubSignIn}
                    data-testid="button-github-signup"
                    className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                    style={{ background: "#24292e", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <GitHubIcon />
                    {isAr ? "إنشاء الحساب باستخدام GitHub" : "Sign up with GitHub"}
                  </button>
                )}
                <div className="flex items-center gap-3 py-2">
                  <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
                  <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
                    {isAr ? "أو أنشئ بالبريد" : "Or create with email"}
                  </span>
                  <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
                </div>
              </div>
            )}

            {/* Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="px-8 space-y-4" style={{ paddingTop: googleEnabled || githubEnabled ? "0" : "24px" }}>
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: labelColor, fontFamily: "'Space Mono', monospace" }}>
                        {t("auth.fullName")}
                      </label>
                      <FormControl>
                        <input
                          placeholder={isAr ? "محمد أحمد" : "John Doe"}
                          {...field}
                          data-testid="input-name"
                          className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                          style={{ background: inputBg, border: "1px solid rgba(255,255,255,0.08)" }}
                          onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,255,224,0.4)")}
                          onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" style={{ color: "#f87171" }} />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: labelColor, fontFamily: "'Space Mono', monospace" }}>
                        {t("auth.email")}
                      </label>
                      <FormControl>
                        <input
                          type="email"
                          placeholder="you@example.com"
                          {...field}
                          data-testid="input-email"
                          className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                          style={{ background: inputBg, border: "1px solid rgba(255,255,255,0.08)" }}
                          onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,255,224,0.4)")}
                          onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" style={{ color: "#f87171" }} />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: labelColor, fontFamily: "'Space Mono', monospace" }}>
                        {t("auth.password")}
                      </label>
                      <FormControl>
                        <input
                          type="password"
                          placeholder={isAr ? "٨ أحرف على الأقل" : "Min. 8 characters"}
                          {...field}
                          data-testid="input-password"
                          className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                          style={{ background: inputBg, border: "1px solid rgba(255,255,255,0.08)" }}
                          onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,255,224,0.4)")}
                          onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" style={{ color: "#f87171" }} />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                    <FormItem>
                      <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: labelColor, fontFamily: "'Space Mono', monospace" }}>
                        {t("auth.confirmPassword")}
                      </label>
                      <FormControl>
                        <input
                          type="password"
                          placeholder={isAr ? "أعد إدخال كلمة المرور" : "Repeat your password"}
                          {...field}
                          data-testid="input-confirm-password"
                          className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                          style={{ background: inputBg, border: "1px solid rgba(255,255,255,0.08)" }}
                          onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,255,224,0.4)")}
                          onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" style={{ color: "#f87171" }} />
                    </FormItem>
                  )} />
                </div>

                <div className="px-8 pt-5 pb-6 space-y-4">
                  <button
                    type="submit"
                    disabled={register.isPending}
                    data-testid="button-submit"
                    className="w-full py-3.5 rounded-xl font-black text-sm transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: "#00FFE0", color: "#050508", fontFamily: "'Space Mono', monospace", boxShadow: "0 0 30px rgba(0,255,224,0.25)" }}
                  >
                    <Zap className="h-4 w-4" />
                    {register.isPending ? (isAr ? "جارٍ إنشاء الحساب..." : "Creating account...") : t("auth.createAccount")}
                  </button>

                  <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {t("auth.haveAccount")}{" "}
                    <Link to="/login" className="font-semibold transition-colors" style={{ color: "#00FFE0" }}>
                      {t("auth.signIn")}
                    </Link>
                  </p>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>

      {/* API Key reveal dialog */}
      <AlertDialog open={!!apiKeyInfo} onOpenChange={(open) => { if (!open) handleKeyDialogClose(); }}>
        <AlertDialogContent className="max-w-lg" style={{ background: "#111118", border: "1px solid rgba(255,255,255,0.1)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ color: "#00C896" }}>
              <CheckCircle2 className="h-5 w-5" />
              {isAr ? "تم إنشاء الحساب — إليك مفتاح API" : "Account created — here's your API key"}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "rgba(255,255,255,0.5)" }}>
              {isAr
                ? <>تم تسجيلك في خطة <span className="font-semibold text-white">{apiKeyInfo?.planName}</span> برصيد <span className="font-semibold text-white">${apiKeyInfo?.creditBalance}</span>. انسخ مفتاحك الآن — لن يُعرض مرة أخرى.</>
                : <>You've been enrolled in the <span className="font-semibold text-white">{apiKeyInfo?.planName}</span> plan with <span className="font-semibold text-white">${apiKeyInfo?.creditBalance}</span> in credits. Copy your API key now — it will <strong>not</strong> be shown again.</>
              }
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-1">
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 rounded-xl text-xs font-mono break-all select-all" dir="ltr" style={{ background: "#0a0a14", border: "1px solid rgba(0,255,224,0.2)", color: "#00FFE0" }}>
                {apiKeyInfo?.fullKey}
              </code>
              <Button variant="outline" size="icon" onClick={copyKey} title={t("common.copy")} style={{ background: "#1a1a28", border: "1px solid rgba(255,255,255,0.1)", color: "white" }}>
                {copied ? <CheckCircle2 className="h-4 w-4" style={{ color: "#00C896" }} /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="rounded-xl p-3 space-y-1.5" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: "#f59e0b" }}>
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {isAr ? "هذه المرة الوحيدة التي ترى فيها المفتاح الكامل." : "This is the only time you'll see the full key."}
              </p>
              <p className="text-xs" style={{ color: "rgba(245,158,11,0.7)" }}>
                {isAr ? "احفظه في مدير كلمات المرور أو متغير البيئة." : "Store it in a password manager or environment variable."}
              </p>
            </div>

            <div className="rounded-xl p-3 space-y-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                <ShieldCheck className="h-3.5 w-3.5" style={{ color: "#00FFE0" }} />
                {isAr ? "كيف تستخدم مفتاحك" : "How to use your key"}
              </p>
              <code className="block text-[11px] font-mono rounded-lg p-2" dir="ltr" style={{ background: "#0a0a14", color: "#00FFE0" }}>
                Authorization: Bearer {apiKeyInfo?.fullKey?.slice(0, 20)}...
              </code>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction
              onClick={handleKeyDialogClose}
              style={{ background: "#00FFE0", color: "#050508", fontFamily: "'Space Mono', monospace", fontWeight: "700" }}
            >
              {isAr ? "نسخت المفتاح — المتابعة" : "I've copied my key — Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
