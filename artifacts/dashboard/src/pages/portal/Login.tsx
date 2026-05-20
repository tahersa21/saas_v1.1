import { useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Zap, CheckCircle2, AlertCircle, ShieldCheck, ArrowLeft } from "lucide-react";
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

async function portalLoginRequest(body: { email: string; password: string; totpCode?: string }) {
  const res = await fetch("/api/portal/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export default function PortalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isAr = i18n.language === "ar";
  const [submitting, setSubmitting] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState("");

  const verifiedStatus = searchParams.get("verified");
  const verifiedReason = searchParams.get("reason");
  const googleStatus = searchParams.get("google");
  const githubStatus = searchParams.get("github");
  const googleReason = searchParams.get("reason");
  const githubReason = searchParams.get("reason");

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

  const startGoogleSignIn = () => { window.location.href = `${API_BASE}/api/portal/auth/google`; };
  const startGitHubSignIn = () => { window.location.href = `${API_BASE}/api/portal/auth/github`; };

  const googleErrorText = (() => {
    if (googleStatus !== "error") return null;
    if (googleReason === "cancelled") return isAr ? "تم إلغاء تسجيل الدخول عبر Google." : "Google sign-in was cancelled.";
    if (googleReason === "email_not_verified") return isAr ? "حساب Google غير مُحقّق البريد." : "Your Google email is not verified.";
    if (googleReason === "account_disabled") return isAr ? "هذا الحساب معطّل." : "This account is disabled. Contact support.";
    if (googleReason === "link_blocked_unverified") return isAr ? "يوجد حساب بنفس البريد لكنه غير مُحقّق." : "An unverified account exists with this email.";
    return isAr ? "تعذّر تسجيل الدخول عبر Google." : "Google sign-in failed. Please try again.";
  })();

  const githubErrorText = (() => {
    if (githubStatus !== "error") return null;
    if (githubReason === "cancelled") return isAr ? "تم إلغاء تسجيل الدخول عبر GitHub." : "GitHub sign-in was cancelled.";
    if (githubReason === "no_email") return isAr ? "حساب GitHub لا يحتوي على بريد إلكتروني عام." : "Your GitHub account has no public email.";
    if (githubReason === "account_disabled") return isAr ? "هذا الحساب معطّل." : "This account is disabled. Contact support.";
    if (githubReason === "link_blocked_unverified") return isAr ? "يوجد حساب بنفس البريد لكنه غير مُحقّق." : "An unverified account exists with this email.";
    return isAr ? "تعذّر تسجيل الدخول عبر GitHub." : "GitHub sign-in failed. Please try again.";
  })();

  const loginSchema = z.object({
    email: z.string().email(isAr ? "أدخل بريداً إلكترونياً صحيحاً" : "Please enter a valid email address"),
    password: z.string().min(1, isAr ? "كلمة المرور مطلوبة" : "Password is required"),
  });

  useEffect(() => {
    if (isAuthenticated && user?.role === "developer") navigate("/portal", { replace: true });
  }, [isAuthenticated, user, navigate]);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    setSubmitting(true);
    try {
      const body: { email: string; password: string; totpCode?: string } = { email: data.email, password: data.password };
      if (totpRequired) {
        if (!/^\d{6}$/.test(totpCode)) {
          toast({ title: isAr ? "أدخل رمزًا من 6 أرقام" : "Enter the 6-digit code", variant: "destructive" });
          return;
        }
        body.totpCode = totpCode;
      }
      const { ok, status, data: res } = await portalLoginRequest(body);
      if (ok && res?.user) { login(res.user); return; }
      if (status === 401 && (res as { totpRequired?: boolean })?.totpRequired) {
        setTotpRequired(true);
        if (totpRequired) {
          toast({ title: isAr ? "رمز التحقّق غير صحيح" : "Invalid 2FA code", variant: "destructive" });
        } else {
          toast({ title: isAr ? "أدخل رمز التحقّق الثنائي" : "Enter your 2FA code", description: isAr ? "افتح تطبيق المصادقة وأدخل الرمز." : "Open your authenticator app." });
        }
        return;
      }
      toast({ title: t("auth.signInFailed"), description: (res as { error?: string })?.error || t("auth.invalidCredentials"), variant: "destructive" });
    } catch (err) {
      toast({ title: t("auth.signInFailed"), description: err instanceof Error ? err.message : t("auth.invalidCredentials"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
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

          {/* Alerts */}
          {verifiedStatus === "success" && (
            <div className="mb-4 flex items-start gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(0,200,150,0.1)", border: "1px solid rgba(0,200,150,0.3)", color: "#00C896" }}>
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">{isAr ? "تم التحقق من بريدك!" : "Email verified!"}</p>
                <p className="text-xs opacity-80">{isAr ? "يمكنك الآن تسجيل الدخول." : "You can now sign in."}</p>
              </div>
            </div>
          )}
          {(googleErrorText || githubErrorText) && (
            <div className="mb-4 flex items-start gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <p>{googleErrorText || githubErrorText}</p>
            </div>
          )}

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
                {t("auth.developerSignIn")}
              </h1>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                {t("auth.developerSignInDesc")}
              </p>
            </div>

            {/* Social buttons */}
            {(googleEnabled || githubEnabled) && (
              <div className="px-8 pt-6 space-y-3">
                {googleEnabled && (
                  <button
                    type="button"
                    onClick={startGoogleSignIn}
                    data-testid="button-google-signin"
                    className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                    style={{ background: "white", color: "#1f1f1f", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
                  >
                    <GoogleIcon />
                    {isAr ? "المتابعة باستخدام Google" : "Continue with Google"}
                  </button>
                )}
                {githubEnabled && (
                  <button
                    type="button"
                    onClick={startGitHubSignIn}
                    data-testid="button-github-signin"
                    className="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                    style={{ background: "#24292e", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <GitHubIcon />
                    {isAr ? "المتابعة باستخدام GitHub" : "Continue with GitHub"}
                  </button>
                )}
                <div className="flex items-center gap-3 py-2">
                  <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
                  <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Space Mono', monospace" }}>
                    {isAr ? "أو" : "OR"}
                  </span>
                  <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
                </div>
              </div>
            )}

            {/* Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="px-8 space-y-4" style={{ paddingTop: googleEnabled || githubEnabled ? "0" : "24px" }}>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: labelColor, fontFamily: "'Space Mono', monospace" }}>
                        {t("auth.email")}
                      </label>
                      <FormControl>
                        <input
                          type="email"
                          placeholder="developer@example.com"
                          {...field}
                          data-testid="input-email"
                          className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none transition-all"
                          style={{
                            background: inputBg,
                            border: "1px solid rgba(255,255,255,0.08)",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                          onFocus={e => (e.currentTarget.style.borderColor = "rgba(0,255,224,0.4)")}
                          onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                        />
                      </FormControl>
                      <FormMessage className="text-xs mt-1" style={{ color: "#f87171" }} />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold tracking-wide" style={{ color: labelColor, fontFamily: "'Space Mono', monospace" }}>
                          {t("auth.password")}
                        </label>
                        <Link to="/forgot-password" className="text-xs transition-colors" style={{ color: "#00FFE0" }}>
                          {t("auth.forgotPassword")}
                        </Link>
                      </div>
                      <FormControl>
                        <input
                          type="password"
                          placeholder="••••••••"
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

                  {totpRequired && (
                    <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(0,255,224,0.05)", border: "1px solid rgba(0,255,224,0.2)" }}>
                      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#00FFE0", fontFamily: "'Space Mono', monospace" }}>
                        <ShieldCheck className="h-4 w-4" />
                        {isAr ? "رمز التحقّق الثنائي" : "Two-factor code"}
                      </div>
                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        placeholder="123456"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        data-testid="input-totp"
                        className="w-full px-4 py-3 rounded-xl text-sm text-white text-center tracking-[0.3em] outline-none"
                        style={{ background: inputBg, border: "1px solid rgba(0,255,224,0.3)", fontFamily: "'Space Mono', monospace", fontSize: "1.2rem" }}
                      />
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {isAr ? "افتح تطبيق المصادقة وأدخل الرمز الحالي." : "Open your authenticator app and enter the current code."}
                      </p>
                    </div>
                  )}
                </div>

                <div className="px-8 pt-5 pb-8 space-y-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    data-testid="button-submit"
                    className="w-full py-3.5 rounded-xl font-black text-sm transition-all hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: "#00FFE0",
                      color: "#050508",
                      fontFamily: "'Space Mono', monospace",
                      boxShadow: "0 0 30px rgba(0,255,224,0.25)",
                    }}
                  >
                    {submitting
                      ? (isAr ? "جارٍ الدخول..." : "Signing in...")
                      : totpRequired
                        ? (isAr ? "تحقّق وادخل" : "Verify & Sign In")
                        : t("auth.signIn")}
                  </button>
                  <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {t("auth.noAccount")}{" "}
                    <Link to="/signup" className="font-semibold transition-colors" style={{ color: "#00FFE0" }}>
                      {t("auth.signUp")}
                    </Link>
                  </p>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
