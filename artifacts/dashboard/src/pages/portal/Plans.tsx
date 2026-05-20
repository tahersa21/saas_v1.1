import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useListPortalPlans,
  useGetPortalApiKeys,
  useGetPortalMe,
  getGetPortalApiKeysQueryKey,
  getGetPortalMeQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, Zap, Image, Video, Text, ArrowUpCircle,
  Crown, AlertCircle, Key, Copy, MessageCircle, Loader2, RefreshCw,
  CreditCard, Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MODELS } from "@/lib/models";
import { authFetch } from "@/lib/authFetch";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrollResult {
  enrolled: boolean;
  existing: boolean;
  keyPrefix: string;
  planName: string;
  creditBalance: number;
  fullKey?: string;
}

interface SpInitiateResponse {
  intentId: number;
  publicKey: string;
  mode: "test" | "live";
  amountUsd: number;
  currency: string;
}

type PaymentMethod = "chargily" | "spaceremit" | "manual";
type SpStep = "select" | "initiating" | "form" | "success";

const WHATSAPP_NUMBER = "213796586479";

function whatsappUrl(planName: string, priceUsd: number) {
  const msg = encodeURIComponent(
    `Hello, I would like to upgrade my AI Gateway account to the ${planName} plan ($${priceUsd}/mo). Please let me know the next steps. Thank you.`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

// ─── Model chip ───────────────────────────────────────────────────────────────

function ModelChip({ modelId }: { modelId: string }) {
  const model = MODELS.find(m => m.id === modelId);
  const label = model?.displayName ?? modelId;
  const cat = model?.category ?? "text";
  const icons: Record<string, React.ReactNode> = {
    text: <Text className="h-3 w-3" />,
    image: <Image className="h-3 w-3" />,
    video: <Video className="h-3 w-3" />,
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted border">
      {icons[cat]} {label}
    </span>
  );
}

const PLAN_ICONS = [
  <Zap className="h-4 w-4" />,
  <Crown className="h-4 w-4" />,
  <ArrowUpCircle className="h-4 w-4" />,
];

// ─── Payment method card ──────────────────────────────────────────────────────

function MethodCard({
  selected, onClick, icon, name, subtitle, chips,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
  subtitle?: string;
  chips?: string[];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-all"
      style={{
        background: selected ? "rgba(0,255,224,0.06)" : "rgba(255,255,255,0.03)",
        border: selected ? "1.5px solid rgba(0,255,224,0.5)" : "1.5px solid rgba(255,255,255,0.08)",
        color: selected ? "#00FFE0" : "rgba(255,255,255,0.6)",
      }}
    >
      {selected && (
        <span
          className="absolute top-2 right-2 h-4 w-4 flex items-center justify-center rounded-full"
          style={{ background: "#00FFE0" }}
        >
          <CheckCircle2 className="h-3 w-3" style={{ color: "#050508" }} />
        </span>
      )}
      <span
        className="flex items-center justify-center w-10 h-10 rounded-xl"
        style={{ background: selected ? "rgba(0,255,224,0.15)" : "rgba(255,255,255,0.06)" }}
      >
        {icon}
      </span>
      <span className="text-xs font-semibold leading-tight">{name}</span>
      {subtitle && <span className="text-[10px] opacity-60">{subtitle}</span>}
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1">
          {chips.map(c => (
            <span
              key={c}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Spaceremit embedded form ─────────────────────────────────────────────────

declare global {
  interface Window {
    SP_PUBLIC_KEY?: string;
    SP_AMOUNT?: number;
    SP_CURRENCY?: string;
    SP_FORM_ID?: string;
    SP_SUCCESSFUL_PAYMENT?: (code: string) => void;
  }
}

function SpaceremitFormEmbed({
  intentId, publicKey, amountUsd,
  onSuccess, onError,
}: {
  intentId: number;
  publicKey: string;
  amountUsd: number;
  onSuccess: (msg: string, purpose?: string, planName?: string) => void;
  onError: (err: string) => void;
}) {
  const formId = `sp-plan-form-${intentId}`;
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
        const body = (await res.json()) as {
          credited?: boolean;
          amountUsd?: number;
          purpose?: string;
          planName?: string;
          error?: string;
        };
        if (!mountedRef.current) return;
        if (!res.ok) {
          onError(body.error ?? `Verification failed (HTTP ${res.status})`);
        } else {
          onSuccess(
            body.purpose === "plan_upgrade"
              ? `Your plan has been upgraded to ${body.planName ?? "the selected plan"}.`
              : `$${Number(body.amountUsd ?? amountUsd).toFixed(2)} USD has been added to your account.`,
            body.purpose,
            body.planName,
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
    script.onerror = () => { if (mountedRef.current) onError("Failed to load payment form. Please try again."); };
    document.body.appendChild(script);

    return () => {
      mountedRef.current = false;
      document.getElementById("spaceremit-js")?.remove();
      delete window.SP_PUBLIC_KEY;
      delete window.SP_AMOUNT;
      delete window.SP_CURRENCY;
      delete window.SP_FORM_ID;
      delete window.SP_SUCCESSFUL_PAYMENT;
    };
  }, []);

  return (
    <div className="space-y-4">
      {(!scriptReady || verifying) && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#00FFE0" }} />
          <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            {verifying ? "Verifying payment…" : "Loading payment form…"}
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PortalPlans() {
  const queryClient = useQueryClient();
  const { data: plans, isLoading, isError } = useListPortalPlans();
  const { data: apiKeys, isLoading: keysLoading, isError: keysError } = useGetPortalApiKeys();
  const { data: meData, refetch: refetchMe } = useGetPortalMe();
  const { toast } = useToast();

  const [enrollingPlanId, setEnrollingPlanId] = useState<number | null>(null);
  const [upgradingPlanId, setUpgradingPlanId] = useState<number | null>(null);
  const [newKeyInfo, setNewKeyInfo] = useState<EnrollResult | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  const [chargilyEnabled, setChargilyEnabled] = useState(false);
  const [spaceremitEnabled, setSpaceremitEnabled] = useState(false);

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [dialogPlan, setDialogPlan] = useState<{ id: number; name: string; priceUsd: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("manual");
  const [spStep, setSpStep] = useState<SpStep>("select");
  const [spIntentData, setSpIntentData] = useState<SpInitiateResponse | null>(null);
  const [spSuccessMsg, setSpSuccessMsg] = useState("");
  const [spInitiating, setSpInitiating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      authFetch("/api/portal/billing/config").then(r => r.ok ? r.json() as Promise<{ enabled?: boolean }> : null).catch(() => null),
      authFetch("/api/portal/billing/spaceremit/config").then(r => r.ok ? r.json() as Promise<{ enabled?: boolean; publicKey?: string | null }> : null).catch(() => null),
    ]).then(([chargily, spaceremit]) => {
      if (cancelled) return;
      if (chargily) setChargilyEnabled(Boolean(chargily.enabled));
      if (spaceremit) setSpaceremitEnabled(Boolean(spaceremit.enabled) && Boolean(spaceremit.publicKey));
    });
    return () => { cancelled = true; };
  }, []);

  const activePlans = (plans ?? []).filter(p => p.isActive).sort((a, b) => a.priceUsd - b.priceUsd);
  const currentPlanIdFromMe = meData?.user?.currentPlanId ?? null;
  const apiKeyPlanIds = new Set(
    (apiKeys ?? []).filter(k => k.isActive && k.planId != null).map(k => k.planId as number)
  );
  const myPlanId = currentPlanIdFromMe ?? (apiKeyPlanIds.size > 0 ? [...apiKeyPlanIds][0] : null);
  const myPlan = activePlans.find(p => p.id === myPlanId);
  const myPlanIndex = myPlan ? activePlans.indexOf(myPlan) : -1;

  const enrollMutation = useMutation({
    mutationFn: async (planId: number): Promise<EnrollResult> => {
      const res = await authFetch(`/api/portal/plans/${planId}/enroll`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enrollment failed");
      return data as EnrollResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: getGetPortalApiKeysQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPortalMeQueryKey() });
      if (result.existing) {
        toast({ title: `✅ ${result.planName} plan activated!`, description: `Your existing API key (${result.keyPrefix}…) now has $${result.creditBalance} in credits.` });
      } else {
        setNewKeyInfo(result);
      }
    },
    onError: (e: Error) => { toast({ title: "Enrollment failed", description: e.message, variant: "destructive" }); },
    onSettled: () => setEnrollingPlanId(null),
  });

  const handleEnrollFree = (planId: number) => {
    setEnrollingPlanId(planId);
    enrollMutation.mutate(planId);
  };

  const upgradeMutation = useMutation({
    mutationFn: async (planId: number): Promise<{ checkoutUrl: string }> => {
      setUpgradingPlanId(planId);
      const res = await authFetch("/api/portal/billing/plan-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start payment");
      return data as { checkoutUrl: string };
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
      else { toast({ title: "Payment error", description: "No checkout URL returned.", variant: "destructive" }); setUpgradingPlanId(null); }
    },
    onError: (e: Error) => {
      toast({ title: "Upgrade failed", description: e.message, variant: "destructive" });
      setUpgradingPlanId(null);
    },
  });

  const openPaymentDialog = (plan: { id: number; name: string; priceUsd: number }) => {
    setDialogPlan(plan);
    const defaultMethod: PaymentMethod = chargilyEnabled ? "chargily" : spaceremitEnabled ? "spaceremit" : "manual";
    setPaymentMethod(defaultMethod);
    setSpStep("select");
    setSpIntentData(null);
    setSpSuccessMsg("");
    setSpInitiating(false);
    setPaymentDialogOpen(true);
  };

  const closePaymentDialog = () => {
    setPaymentDialogOpen(false);
    setTimeout(() => {
      setDialogPlan(null);
      setSpStep("select");
      setSpIntentData(null);
      setSpSuccessMsg("");
      setSpInitiating(false);
    }, 200);
  };

  const handleProceed = async () => {
    if (!dialogPlan) return;

    if (paymentMethod === "chargily") {
      closePaymentDialog();
      upgradeMutation.mutate(dialogPlan.id);
    } else if (paymentMethod === "spaceremit") {
      setSpInitiating(true);
      setSpStep("initiating");
      try {
        const res = await authFetch("/api/portal/billing/spaceremit/initiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountUsd: dialogPlan.priceUsd,
            purpose: "plan_upgrade",
            planId: dialogPlan.id,
            planName: dialogPlan.name,
          }),
        });
        const data = (await res.json()) as SpInitiateResponse & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to initiate payment");
        setSpIntentData(data);
        setSpStep("form");
      } catch (err) {
        toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to start payment", variant: "destructive" });
        setSpStep("select");
      } finally {
        setSpInitiating(false);
      }
    }
  };

  const handleSpaceremitSuccess = (_msg: string, purpose?: string, planName?: string) => {
    const msg = purpose === "plan_upgrade"
      ? `Your plan has been upgraded to ${planName ?? dialogPlan?.name ?? "the selected plan"} successfully!`
      : _msg;
    setSpSuccessMsg(msg);
    setSpStep("success");
    queryClient.invalidateQueries({ queryKey: getGetPortalApiKeysQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPortalMeQueryKey() });
    refetchMe();
  };

  const copyNewKey = () => {
    if (!newKeyInfo?.fullKey) return;
    navigator.clipboard.writeText(newKeyInfo.fullKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
    toast({ title: "API key copied — store it safely!" });
  };

  if (isLoading || keysLoading || isError || keysError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
          <p className="text-muted-foreground mt-1">Available subscription plans and their included models.</p>
        </div>
        {isError || keysError ? (
          <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            Failed to load plans. Please refresh the page.
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Loading plans...</div>
        )}
      </div>
    );
  }

  const hasAnyPaymentMethod = chargilyEnabled || spaceremitEnabled;
  const methodCount = (chargilyEnabled ? 1 : 0) + (spaceremitEnabled ? 1 : 0) + 1; // +1 for manual

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
        <p className="text-muted-foreground mt-1">Available subscription plans and their included models.</p>
      </div>

      {/* Current plan banner */}
      {myPlan ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
          <div className="bg-primary/10 rounded-full p-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">You are on the <span className="text-primary">{myPlan.name}</span> plan</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ${myPlan.monthlyCredits} monthly credits · {myPlan.rpm} RPM · {myPlan.modelsAllowed.length} models
            </p>
          </div>
          {myPlanIndex < activePlans.length - 1 && (
            <Badge variant="outline" className="text-xs shrink-0 border-primary/30 text-primary">Upgrade available</Badge>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Refresh plan info"
            onClick={() => { queryClient.invalidateQueries({ queryKey: getGetPortalMeQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetPortalApiKeysQueryKey() }); refetchMe(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
          <div className="bg-amber-500/10 rounded-full p-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-amber-600">No active plan</p>
            <p className="text-xs text-muted-foreground mt-0.5">Start with the Free plan instantly, or upgrade to a paid plan.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Refresh plan info"
            onClick={() => { queryClient.invalidateQueries({ queryKey: getGetPortalMeQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetPortalApiKeysQueryKey() }); refetchMe(); }}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
            <a href="/portal/api-keys"><Key className="h-3.5 w-3.5" /> View Keys</a>
          </Button>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {activePlans.map((plan, idx) => {
          const isMyPlan = plan.id === myPlanId;
          const isUpgrade = myPlanIndex >= 0 && idx > myPlanIndex;
          const isDowngrade = myPlanIndex >= 0 && idx < myPlanIndex;
          const isFree = plan.priceUsd === 0;
          const isEnrolling = enrollingPlanId === plan.id;
          const isUpgrading = upgradingPlanId === plan.id;
          const models: string[] = plan.modelsAllowed;
          const textModels = models.filter(id => MODELS.find(m => m.id === id)?.category === "text");
          const imageModels = models.filter(id => MODELS.find(m => m.id === id)?.category === "image");
          const videoModels = models.filter(id => MODELS.find(m => m.id === id)?.category === "video");

          return (
            <Card
              key={plan.id}
              className={`flex flex-col relative transition-all ${
                isMyPlan ? "border-primary shadow-md ring-1 ring-primary/20"
                : isUpgrade || (!myPlan && !isFree) ? "border-dashed hover:border-primary/40 hover:shadow-sm"
                : isDowngrade ? "opacity-60" : ""
              }`}
            >
              {isMyPlan && (
                <div className="absolute -top-3 left-4">
                  <div className="bg-primary text-primary-foreground text-[11px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                    <CheckCircle2 className="h-3 w-3" /> Your Current Plan
                  </div>
                </div>
              )}
              {(isUpgrade || (!myPlan && !isFree)) && !isMyPlan && (
                <div className="absolute -top-3 left-4">
                  <div className="bg-muted text-muted-foreground border text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5">
                    <ArrowUpCircle className="h-3 w-3" /> Upgrade
                  </div>
                </div>
              )}

              <CardHeader className="pb-2 pt-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">
                    <span className={isMyPlan ? "text-primary" : ""}>{plan.name}</span>
                  </CardTitle>
                  <span className={`p-1.5 rounded-md ${isMyPlan ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {PLAN_ICONS[idx % PLAN_ICONS.length]}
                  </span>
                </div>
                {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
              </CardHeader>

              <CardContent className="flex-1 flex flex-col gap-4">
                <div className="flex items-end gap-1">
                  <span className={`text-4xl font-bold ${isMyPlan ? "text-primary" : ""}`}>
                    {isFree ? "Free" : `$${plan.priceUsd}`}
                  </span>
                  {!isFree && <span className="text-muted-foreground mb-1 text-sm">/mo</span>}
                </div>

                <div className="space-y-2 text-sm border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      Monthly Credits
                      <span className="text-[10px] bg-muted border rounded px-1 py-0.5 font-mono text-muted-foreground/70">USD</span>
                    </span>
                    <span className="font-mono font-medium">${plan.monthlyCredits.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Rate Limit</span>
                    <span className="font-mono font-medium">{plan.rpm} RPM</span>
                  </div>
                  {(plan as typeof plan & { rpd?: number }).rpd != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Daily Limit</span>
                      <span className="font-mono font-medium">
                        {(plan as typeof plan & { rpd?: number }).rpd! > 0
                          ? `${(plan as typeof plan & { rpd?: number }).rpd!.toLocaleString()} / day`
                          : "Unlimited"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Allowed Models</p>
                  {textModels.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Text className="h-3 w-3" /> Text</p>
                      <div className="flex flex-wrap gap-1">{textModels.map(id => <ModelChip key={id} modelId={id} />)}</div>
                    </div>
                  )}
                  {imageModels.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Image className="h-3 w-3" /> Image</p>
                      <div className="flex flex-wrap gap-1">{imageModels.map(id => <ModelChip key={id} modelId={id} />)}</div>
                    </div>
                  )}
                  {videoModels.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Video className="h-3 w-3" /> Video</p>
                      <div className="flex flex-wrap gap-1">{videoModels.map(id => <ModelChip key={id} modelId={id} />)}</div>
                    </div>
                  )}
                </div>

                {/* CTA — single Upgrade button */}
                <div className="pt-1">
                  {isMyPlan ? (
                    <Button className="w-full" disabled>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Active Plan
                    </Button>
                  ) : isDowngrade ? (
                    <Button className="w-full" variant="ghost" disabled>Lower Tier</Button>
                  ) : isFree ? (
                    <Button className="w-full" onClick={() => handleEnrollFree(plan.id)} disabled={isEnrolling}>
                      {isEnrolling
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Activating...</>
                        : <><Zap className="h-4 w-4 mr-2" /> Start Free Now</>
                      }
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => openPaymentDialog({ id: plan.id, name: plan.name, priceUsd: plan.priceUsd })}
                      disabled={isUpgrading}
                    >
                      {isUpgrading
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redirecting…</>
                        : <><ArrowUpCircle className="h-4 w-4 mr-2" /> Upgrade — Pay ${plan.priceUsd}</>
                      }
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Payment method dialog ──────────────────────────────────────────── */}
      <Dialog open={paymentDialogOpen} onOpenChange={(open) => { if (!open) closePaymentDialog(); }}>
        <DialogContent
          className="max-w-md p-0 gap-0 overflow-hidden"
          style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {/* Dialog header with plan info */}
          <div
            className="px-6 py-5"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,224,0.12) 0%, rgba(0,140,110,0.08) 100%)",
              borderBottom: "1px solid rgba(0,255,224,0.12)",
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
                <ArrowUpCircle className="h-5 w-5" style={{ color: "#00FFE0" }} />
                Upgrade to {dialogPlan?.name}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-4xl font-black" style={{ color: "#00FFE0" }}>
                ${dialogPlan?.priceUsd}
              </span>
              <span className="mb-1 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>/month</span>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Step: select method */}
            {(spStep === "select") && (
              <>
                <div>
                  <p className="text-sm font-semibold mb-3" style={{ color: "rgba(255,255,255,0.8)" }}>
                    Choose payment method:
                  </p>
                  <div
                    className="grid gap-3"
                    style={{ gridTemplateColumns: `repeat(${methodCount}, 1fr)` }}
                  >
                    {chargilyEnabled && (
                      <MethodCard
                        selected={paymentMethod === "chargily"}
                        onClick={() => setPaymentMethod("chargily")}
                        icon={<CreditCard className="h-5 w-5" />}
                        name="الدفع الإلكتروني"
                        subtitle="آمن وسريع"
                        chips={["Edahabia", "CIB"]}
                      />
                    )}
                    {spaceremitEnabled && (
                      <MethodCard
                        selected={paymentMethod === "spaceremit"}
                        onClick={() => setPaymentMethod("spaceremit")}
                        icon={<Globe className="h-5 w-5" />}
                        name="بطاقة دولية"
                        subtitle="آمن وسريع"
                        chips={["Mastercard", "Visa"]}
                      />
                    )}
                    <MethodCard
                      selected={paymentMethod === "manual"}
                      onClick={() => setPaymentMethod("manual")}
                      icon={<MessageCircle className="h-5 w-5" />}
                      name="الدفع اليدوي"
                      subtitle="تحويل بنكي"
                    />
                  </div>
                </div>

                {/* Method-specific content */}
                {paymentMethod === "manual" && (
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <p className="text-sm font-semibold flex items-center gap-2" style={{ color: "rgba(255,255,255,0.8)" }}>
                      <MessageCircle className="h-4 w-4" style={{ color: "#25D366" }} />
                      خطوات الدفع اليدوي
                    </p>
                    <ol className="text-xs space-y-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                      <li>1. تواصل معنا من اجل ترقية حسابك</li>
                    </ol>
                    <Button
                      className="w-full text-white font-semibold"
                      style={{ background: "#25D366", border: "none" }}
                      asChild
                    >
                      <a
                        href={whatsappUrl(dialogPlan?.name ?? "", dialogPlan?.priceUsd ?? 0)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle className="h-4 w-4 mr-2" />
                        Contact via WhatsApp
                      </a>
                    </Button>
                  </div>
                )}

                {(paymentMethod === "chargily" || paymentMethod === "spaceremit") && (
                  <Button
                    className="w-full font-semibold"
                    style={{ background: "#00FFE0", color: "#050508" }}
                    onClick={() => void handleProceed()}
                    disabled={spInitiating}
                  >
                    {spInitiating
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting…</>
                      : "Proceed to Payment"
                    }
                  </Button>
                )}
              </>
            )}

            {/* Step: initiating / loading */}
            {spStep === "initiating" && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#00FFE0" }} />
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Preparing payment form…</span>
              </div>
            )}

            {/* Step: Spaceremit embedded form */}
            {spStep === "form" && spIntentData && (
              <SpaceremitFormEmbed
                intentId={spIntentData.intentId}
                publicKey={spIntentData.publicKey}
                amountUsd={spIntentData.amountUsd}
                onSuccess={handleSpaceremitSuccess}
                onError={(err) => {
                  toast({ title: "Payment error", description: err, variant: "destructive" });
                  setSpStep("select");
                }}
              />
            )}

            {/* Step: success */}
            {spStep === "success" && (
              <div className="flex flex-col items-center text-center py-6 gap-4">
                <div
                  className="flex items-center justify-center w-16 h-16 rounded-full"
                  style={{ background: "rgba(0,255,224,0.12)" }}
                >
                  <CheckCircle2 className="h-8 w-8" style={{ color: "#00FFE0" }} />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">Payment Successful!</p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{spSuccessMsg}</p>
                </div>
                <Button
                  className="w-full font-semibold"
                  style={{ background: "#00FFE0", color: "#050508" }}
                  onClick={closePaymentDialog}
                >
                  Continue
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New key reveal dialog */}
      <AlertDialog open={!!newKeyInfo && !!newKeyInfo.fullKey} onOpenChange={(open) => { if (!open) setNewKeyInfo(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
              {newKeyInfo?.planName} Plan Activated!
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your account is now on the <strong>{newKeyInfo?.planName}</strong> plan with{" "}
              <strong>${newKeyInfo?.creditBalance}</strong> in credits. Copy your API key now — it will not be shown again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 bg-muted rounded-md text-xs font-mono break-all border border-primary/20 select-all">
                {newKeyInfo?.fullKey}
              </code>
              <Button variant="outline" size="icon" onClick={copyNewKey}>
                {keyCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-amber-600 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Store this key safely. You won't be able to see the full key again.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setNewKeyInfo(null)}>I've saved my key — Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
