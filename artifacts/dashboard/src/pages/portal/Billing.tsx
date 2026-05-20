import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Loader2, Wallet, ExternalLink, AlertCircle, CheckCircle2, XCircle, Clock,
  MessageCircle, PauseCircle, DollarSign,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/authFetch";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChargilyConfig {
  dzdToUsdRate: number;
  minTopupDzd: number;
  maxTopupDzd: number;
  mode: "test" | "live";
  currency: string;
  enabled: boolean;
}

interface ChargilyIntent {
  id: number;
  chargilyCheckoutId: string;
  amountDzd: number;
  amountUsd: number;
  exchangeRate: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "canceled" | "expired";
  mode: "test" | "live";
  checkoutUrl: string | null;
  creditedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface SpaceremitConfig {
  enabled: boolean;
  mode: "test" | "live";
  minTopupUsd: number;
  maxTopupUsd: number;
  currency: string;
  publicKey: string | null;
}

interface SpaceremitIntent {
  id: number;
  amountUsd: number;
  status: "pending" | "verified" | "credited" | "failed";
  mode: "test" | "live";
  statusTag: string | null;
  creditedAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface SpInitiateResponse {
  intentId: number;
  publicKey: string;
  mode: "test" | "live";
  amountUsd: number;
  currency: string;
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

const CHARGILY_STATUS_BADGE: Record<ChargilyIntent["status"], { variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode; labelEn: string; labelAr: string }> = {
  pending:  { variant: "secondary",   icon: <Clock className="h-3 w-3" />,         labelEn: "Pending",  labelAr: "قيد الانتظار" },
  paid:     { variant: "default",     icon: <CheckCircle2 className="h-3 w-3" />,  labelEn: "Paid",     labelAr: "تم الدفع" },
  failed:   { variant: "destructive", icon: <XCircle className="h-3 w-3" />,       labelEn: "Failed",   labelAr: "فشل" },
  canceled: { variant: "outline",     icon: <XCircle className="h-3 w-3" />,       labelEn: "Canceled", labelAr: "ملغى" },
  expired:  { variant: "outline",     icon: <XCircle className="h-3 w-3" />,       labelEn: "Expired",  labelAr: "منتهٍ" },
};

const SP_STATUS_BADGE: Record<SpaceremitIntent["status"], { variant: "default" | "secondary" | "destructive" | "outline"; labelEn: string; labelAr: string }> = {
  pending:  { variant: "secondary",   labelEn: "Pending",  labelAr: "قيد الانتظار" },
  verified: { variant: "secondary",   labelEn: "Verified", labelAr: "تم التحقق" },
  credited: { variant: "default",     labelEn: "Credited", labelAr: "تم الإضافة" },
  failed:   { variant: "destructive", labelEn: "Failed",   labelAr: "فشل" },
};

// ─── Spaceremit embedded form component ──────────────────────────────────────

declare global {
  interface Window {
    SP_PUBLIC_KEY?: string;
    SP_AMOUNT?: number;
    SP_CURRENCY?: string;
    SP_FORM_ID?: string;
    SP_SUCCESSFUL_PAYMENT?: (code: string) => void;
  }
}

interface SpaceremitFormEmbedProps {
  intentId: number;
  publicKey: string;
  amountUsd: number;
  isAr: boolean;
  onSuccess: (message: string) => void;
  onError: (err: string) => void;
}

function SpaceremitFormEmbed({ intentId, publicKey, amountUsd, isAr, onSuccess, onError }: SpaceremitFormEmbedProps) {
  const formId = `sp-form-${intentId}`;
  const [scriptReady, setScriptReady] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const existingScript = document.getElementById("spaceremit-js");
    if (existingScript) existingScript.remove();

    window.SP_PUBLIC_KEY = publicKey;
    window.SP_AMOUNT = amountUsd;
    window.SP_CURRENCY = "USD";
    window.SP_FORM_ID = formId;

    window.SP_SUCCESSFUL_PAYMENT = async (code: string) => {
      if (!mountedRef.current) return;
      setVerifying(true);
      try {
        const res = await authFetch("/api/portal/billing/spaceremit/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId, paymentCode: code }),
        });
        const body = (await res.json()) as { credited?: boolean; amountUsd?: number; purpose?: string; error?: string };
        if (!mountedRef.current) return;
        if (!res.ok) {
          onError(body.error ?? `Verification failed (HTTP ${res.status})`);
        } else {
          const amt = body.amountUsd ?? amountUsd;
          onSuccess(
            isAr
              ? `تمت إضافة $${Number(amt).toFixed(2)} إلى رصيدك بنجاح.`
              : `$${Number(amt).toFixed(2)} USD has been added to your account.`
          );
        }
      } catch (err) {
        if (mountedRef.current) {
          onError(err instanceof Error ? err.message : "Network error during verification");
        }
      } finally {
        if (mountedRef.current) setVerifying(false);
      }
    };

    const script = document.createElement("script");
    script.id = "spaceremit-js";
    script.src = "https://spaceremit.com/js/gateway.min.js";
    script.onload = () => { if (mountedRef.current) setScriptReady(true); };
    script.onerror = () => { if (mountedRef.current) onError(isAr ? "تعذر تحميل نموذج الدفع" : "Failed to load payment form"); };
    document.body.appendChild(script);

    return () => {
      mountedRef.current = false;
      const s = document.getElementById("spaceremit-js");
      if (s) s.remove();
      delete window.SP_PUBLIC_KEY;
      delete window.SP_AMOUNT;
      delete window.SP_CURRENCY;
      delete window.SP_FORM_ID;
      delete window.SP_SUCCESSFUL_PAYMENT;
    };
  }, []);

  return (
    <div className="space-y-4">
      {!scriptReady && !verifying && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            {isAr ? "جاري تحميل نموذج الدفع…" : "Loading payment form…"}
          </span>
        </div>
      )}

      {verifying && (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            {isAr ? "جاري التحقق من الدفع…" : "Verifying payment…"}
          </span>
        </div>
      )}

      <div
        id={formId}
        style={{ display: scriptReady && !verifying ? "block" : "none" }}
        className="min-h-[100px]"
      />
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function PortalBilling() {
  const { t: _t } = useTranslation();
  const isAr = i18n.language === "ar";
  const { toast } = useToast();

  // ── Chargily state ────────────────────────────────────────────────────────
  const [config, setConfig] = useState<ChargilyConfig | null>(null);
  const [intents, setIntents] = useState<ChargilyIntent[] | null>(null);
  const [amountStr, setAmountStr] = useState("1000");
  const [submitting, setSubmitting] = useState(false);

  // ── Spaceremit state ──────────────────────────────────────────────────────
  const [spConfig, setSpConfig] = useState<SpaceremitConfig | null>(null);
  const [spIntents, setSpIntents] = useState<SpaceremitIntent[] | null>(null);
  const [spAmountStr, setSpAmountStr] = useState("10");
  const [spModalOpen, setSpModalOpen] = useState(false);
  const [spStep, setSpStep] = useState<"initiating" | "form" | "success" | "error">("initiating");
  const [spIntentData, setSpIntentData] = useState<SpInitiateResponse | null>(null);
  const [spResultMsg, setSpResultMsg] = useState("");
  const [spErrorMsg, setSpErrorMsg] = useState("");

  // ── Loading / error ───────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [cfgRes, intentsRes, spCfgRes, spIntentsRes] = await Promise.all([
        authFetch("/api/portal/billing/config"),
        authFetch("/api/portal/billing/intents"),
        authFetch("/api/portal/billing/spaceremit/config"),
        authFetch("/api/portal/billing/spaceremit/intents"),
      ]);
      if (!cfgRes.ok) throw new Error(`Config HTTP ${cfgRes.status}`);
      if (!intentsRes.ok) throw new Error(`Intents HTTP ${intentsRes.status}`);

      const cfg = (await cfgRes.json()) as ChargilyConfig;
      const list = (await intentsRes.json()) as ChargilyIntent[];
      setConfig(cfg);
      setIntents(list);
      setAmountStr(String(cfg.minTopupDzd >= 1000 ? cfg.minTopupDzd : 1000));

      if (spCfgRes.ok) setSpConfig((await spCfgRes.json()) as SpaceremitConfig);
      if (spIntentsRes.ok) setSpIntents((await spIntentsRes.json()) as SpaceremitIntent[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Chargily derived state ────────────────────────────────────────────────
  const amount = Number(amountStr);
  const previewUsd = useMemo(() => {
    if (!config || !Number.isFinite(amount) || amount <= 0) return 0;
    return amount / config.dzdToUsdRate;
  }, [amount, config]);

  const validationError = useMemo(() => {
    if (!config) return null;
    if (!Number.isFinite(amount) || amount <= 0) return isAr ? "أدخل مبلغاً صحيحاً" : "Enter a valid amount";
    if (amount < config.minTopupDzd) return (isAr ? "الحد الأدنى: " : "Minimum: ") + config.minTopupDzd + " DZD";
    if (amount > config.maxTopupDzd) return (isAr ? "الحد الأقصى: " : "Maximum: ") + config.maxTopupDzd + " DZD";
    return null;
  }, [amount, config, isAr]);

  // ── Spaceremit derived state ──────────────────────────────────────────────
  const spAmount = Number(spAmountStr);
  const spValidationError = useMemo(() => {
    if (!spConfig) return null;
    if (!Number.isFinite(spAmount) || spAmount <= 0) return isAr ? "أدخل مبلغاً صحيحاً" : "Enter a valid amount";
    if (spAmount < spConfig.minTopupUsd) return (isAr ? "الحد الأدنى: " : "Minimum: ") + `$${spConfig.minTopupUsd}`;
    if (spAmount > spConfig.maxTopupUsd) return (isAr ? "الحد الأقصى: " : "Maximum: ") + `$${spConfig.maxTopupUsd.toLocaleString()}`;
    return null;
  }, [spAmount, spConfig, isAr]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleChargilyTopup() {
    if (validationError || !config) return;
    setSubmitting(true);
    try {
      const res = await authFetch("/api/portal/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountDzd: Math.round(amount) }),
      });
      const body = await res.json() as { checkoutUrl?: string; error?: string };
      if (!res.ok) {
        toast({ title: isAr ? "فشلت العملية" : "Top-up failed", description: body.error ?? `HTTP ${res.status}`, variant: "destructive" });
        return;
      }
      if (typeof body.checkoutUrl === "string") window.location.assign(body.checkoutUrl);
    } catch (err) {
      toast({ title: isAr ? "خطأ في الاتصال" : "Network error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function openSpaceremitModal() {
    if (spValidationError || !spConfig) return;
    setSpStep("initiating");
    setSpIntentData(null);
    setSpErrorMsg("");
    setSpResultMsg("");
    setSpModalOpen(true);

    try {
      const res = await authFetch("/api/portal/billing/spaceremit/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: spAmount, purpose: "topup" }),
      });
      const body = await res.json() as SpInitiateResponse & { error?: string };
      if (!res.ok) {
        setSpStep("error");
        setSpErrorMsg(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setSpIntentData(body);
      setSpStep("form");
    } catch (err) {
      setSpStep("error");
      setSpErrorMsg(err instanceof Error ? err.message : "Network error");
    }
  }

  function handleSpaceremitSuccess(msg: string) {
    setSpResultMsg(msg);
    setSpStep("success");
    void loadData();
  }

  function handleSpaceremitError(err: string) {
    setSpErrorMsg(err);
    setSpStep("error");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !config) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>{error ?? (isAr ? "تعذر تحميل الإعدادات" : "Failed to load billing config")}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          {isAr ? "شحن الرصيد" : "Top up Credits"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isAr
            ? "اختر طريقة الدفع المناسبة لشحن رصيدك."
            : "Choose your preferred payment method to top up your account."}
        </p>
      </div>

      {/* ── Chargily Section ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          {isAr ? "الدفع بالدينار الجزائري — Chargily Pay" : "Pay in DZD — Chargily Pay"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isAr ? "ادفع بالدينار الجزائري ويُحوَّل الرصيد تلقائياً إلى USD." : "Pay in Algerian Dinars — credited in USD at the configured rate."}
        </p>
        {config.mode === "test" && (
          <Badge variant="outline" className="border-amber-500 text-amber-600">
            {isAr ? "وضع الاختبار" : "Test mode"}
          </Badge>
        )}
      </div>

      {config.enabled ? (
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? "إنشاء عملية دفع — Chargily" : "New Top-up via Chargily"}</CardTitle>
            <CardDescription>
              {isAr ? "سعر الصرف الحالي:" : "Current rate:"} 1 USD = {config.dzdToUsdRate} DZD
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{isAr ? "المبلغ بالدينار الجزائري (DZD)" : "Amount (DZD)"}</label>
              <Input
                type="number"
                min={config.minTopupDzd}
                max={config.maxTopupDzd}
                step={100}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                dir="ltr"
                className="text-lg font-mono"
              />
              <div className="text-xs text-muted-foreground">
                {isAr ? "الحد الأدنى" : "Min"}: {config.minTopupDzd} DZD · {isAr ? "الحد الأقصى" : "Max"}: {config.maxTopupDzd.toLocaleString()} DZD
              </div>
            </div>

            <div className="rounded-md bg-muted/50 p-4 border">
              <div className="text-sm text-muted-foreground">{isAr ? "ستحصل على" : "You will receive"}</div>
              <div className="text-2xl font-bold tabular-nums" dir="ltr">
                ${previewUsd.toFixed(4)} <span className="text-base text-muted-foreground font-normal">USD</span>
              </div>
            </div>

            {validationError && (
              <div className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> {validationError}
              </div>
            )}

            <Button
              className="w-full"
              disabled={submitting || Boolean(validationError)}
              onClick={handleChargilyTopup}
              data-testid="button-pay-chargily"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              {isAr ? "ادفع عبر Chargily" : "Pay with Chargily"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <PauseCircle className="h-5 w-5" />
              {isAr ? "خدمة Chargily متوقفة مؤقتاً" : "Chargily top-ups are temporarily paused"}
            </CardTitle>
            <CardDescription>
              {isAr
                ? "الدفع عبر Chargily متوقف حالياً. يمكنك المحاولة عبر Spaceremit أو التواصل معنا عبر واتساب."
                : "Chargily payments are currently disabled. Try Spaceremit below, or contact us on WhatsApp."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              asChild
              className="w-full bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0"
              data-testid="button-contact-whatsapp"
            >
              <a
                href={`https://wa.me/213796586479?text=${encodeURIComponent(
                  isAr
                    ? "مرحباً، أرغب في شحن رصيد حسابي على AI Gateway."
                    : "Hello, I'd like to top up my AI Gateway account."
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                {isAr ? "تواصل عبر واتساب" : "Contact via WhatsApp"}
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Chargily transaction history ────────────────────────────────── */}
      {intents && intents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? "سجل معاملات Chargily" : "Chargily transaction history"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 text-left">{isAr ? "التاريخ" : "Date"}</th>
                    <th className="py-2 text-left">DZD</th>
                    <th className="py-2 text-left">USD</th>
                    <th className="py-2 text-left">{isAr ? "الحالة" : "Status"}</th>
                    <th className="py-2 text-left"></th>
                  </tr>
                </thead>
                <tbody>
                  {intents.map((it) => {
                    const meta = CHARGILY_STATUS_BADGE[it.status];
                    return (
                      <tr key={it.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-3 font-mono text-xs" dir="ltr">{new Date(it.createdAt).toLocaleString(isAr ? "ar" : "en")}</td>
                        <td className="py-3 tabular-nums" dir="ltr">{it.amountDzd.toLocaleString()}</td>
                        <td className="py-3 tabular-nums" dir="ltr">${Number(it.amountUsd).toFixed(4)}</td>
                        <td className="py-3">
                          <Badge variant={meta.variant} className="gap-1">
                            {meta.icon}
                            {isAr ? meta.labelAr : meta.labelEn}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {it.status === "pending" && it.checkoutUrl && (
                            <a href={it.checkoutUrl} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                              {isAr ? "إكمال" : "Resume"} <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Spaceremit Section ───────────────────────────────────────────── */}
      {spConfig && (
        <>
          <div className="border-t pt-4 space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {isAr ? "الدفع بالدولار الأمريكي — Spaceremit" : "Pay in USD — Spaceremit"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "ادفع مباشرةً بالدولار الأمريكي عبر Spaceremit — بطاقة بنكية أو محافظ إلكترونية."
                : "Pay directly in USD via Spaceremit — card or local payment methods."}
            </p>
            {spConfig.mode === "test" && (
              <Badge variant="outline" className="border-amber-500 text-amber-600">
                {isAr ? "وضع الاختبار" : "Test mode"}
              </Badge>
            )}
          </div>

          {spConfig.enabled && spConfig.publicKey ? (
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? "إنشاء عملية دفع — Spaceremit" : "New Top-up via Spaceremit"}</CardTitle>
                <CardDescription>
                  {isAr ? "المبلغ بالدولار الأمريكي. 1 USD = 1 رصيد." : "Amount in USD. 1 USD = 1 credit."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{isAr ? "المبلغ بالدولار (USD)" : "Amount (USD)"}</label>
                  <Input
                    type="number"
                    min={spConfig.minTopupUsd}
                    max={spConfig.maxTopupUsd}
                    step={1}
                    value={spAmountStr}
                    onChange={(e) => setSpAmountStr(e.target.value)}
                    dir="ltr"
                    className="text-lg font-mono"
                  />
                  <div className="text-xs text-muted-foreground">
                    {isAr ? "الحد الأدنى" : "Min"}: ${spConfig.minTopupUsd} · {isAr ? "الحد الأقصى" : "Max"}: ${spConfig.maxTopupUsd.toLocaleString()}
                  </div>
                </div>

                <div className="rounded-md bg-muted/50 p-4 border">
                  <div className="text-sm text-muted-foreground">{isAr ? "ستحصل على" : "You will receive"}</div>
                  <div className="text-2xl font-bold tabular-nums" dir="ltr">
                    ${Number.isFinite(spAmount) && spAmount > 0 ? spAmount.toFixed(2) : "0.00"}{" "}
                    <span className="text-base text-muted-foreground font-normal">USD</span>
                  </div>
                </div>

                {spValidationError && (
                  <div className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> {spValidationError}
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={Boolean(spValidationError)}
                  onClick={openSpaceremitModal}
                  data-testid="button-pay-spaceremit"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  {isAr ? "ادفع عبر Spaceremit" : "Pay with Spaceremit"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <PauseCircle className="h-5 w-5" />
                  {isAr ? "خدمة Spaceremit غير متاحة حالياً" : "Spaceremit payments are currently unavailable"}
                </CardTitle>
              </CardHeader>
            </Card>
          )}

          {/* Spaceremit transaction history */}
          {spIntents && spIntents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? "سجل معاملات Spaceremit" : "Spaceremit transaction history"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left">{isAr ? "التاريخ" : "Date"}</th>
                        <th className="py-2 text-left">USD</th>
                        <th className="py-2 text-left">{isAr ? "الحالة" : "Status"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spIntents.map((it) => {
                        const meta = SP_STATUS_BADGE[it.status] ?? SP_STATUS_BADGE.pending;
                        return (
                          <tr key={it.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-3 font-mono text-xs" dir="ltr">{new Date(it.createdAt).toLocaleString(isAr ? "ar" : "en")}</td>
                            <td className="py-3 tabular-nums" dir="ltr">${Number(it.amountUsd).toFixed(2)}</td>
                            <td className="py-3">
                              <Badge variant={meta.variant} className="gap-1">
                                {isAr ? meta.labelAr : meta.labelEn}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Spaceremit Payment Dialog ────────────────────────────────────── */}
      <Dialog open={spModalOpen} onOpenChange={(open) => { if (!open) setSpModalOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isAr ? "الدفع عبر Spaceremit" : "Pay with Spaceremit"}
            </DialogTitle>
            <DialogDescription>
              {spIntentData
                ? (isAr ? `المبلغ: $${spIntentData.amountUsd} USD` : `Amount: $${spIntentData.amountUsd} USD`)
                : (isAr ? "جاري التحضير…" : "Preparing…")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {spStep === "initiating" && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {isAr ? "جاري التحضير…" : "Preparing payment…"}
                </span>
              </div>
            )}

            {spStep === "form" && spIntentData && (
              <SpaceremitFormEmbed
                key={spIntentData.intentId}
                intentId={spIntentData.intentId}
                publicKey={spIntentData.publicKey}
                amountUsd={spIntentData.amountUsd}
                isAr={isAr}
                onSuccess={handleSpaceremitSuccess}
                onError={handleSpaceremitError}
              />
            )}

            {spStep === "success" && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="text-sm font-medium text-green-700 dark:text-green-400">{spResultMsg}</p>
                <Button className="mt-2" onClick={() => setSpModalOpen(false)}>
                  {isAr ? "إغلاق" : "Close"}
                </Button>
              </div>
            )}

            {spStep === "error" && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <XCircle className="h-10 w-10 text-destructive" />
                <p className="text-sm text-destructive">{spErrorMsg}</p>
                <Button variant="outline" onClick={() => setSpModalOpen(false)}>
                  {isAr ? "إغلاق" : "Close"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
