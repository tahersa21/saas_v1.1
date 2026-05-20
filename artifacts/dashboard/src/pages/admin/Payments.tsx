import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Save, KeyRound, Copy, Webhook, Power, CreditCard,
  CheckCircle2, RefreshCw, Wallet,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Chargily ─────────────────────────────────────────────────────────────────

interface ChargilySecretsState {
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  secretKeySource: "db" | "env" | "missing";
  webhookSecretSource: "db" | "env" | "missing";
  mode: "test" | "live";
  webhookUrl: string;
}

interface ChargilyIntent {
  id: number;
  userId: number;
  chargilyCheckoutId: string;
  amountDzd: number;
  amountUsd: string;
  status: string;
  mode: string;
  metadata: string | null;
  createdAt: string;
  checkoutUrl: string;
}

function ChargilySecretsCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);
  const [state, setState] = useState<ChargilySecretsState | null>(null);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [mode, setMode] = useState<"test" | "live">("test");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [secretsRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/billing/chargily/secrets`, { credentials: "include" }),
        fetch(`${API_BASE}/api/admin/billing/chargily/settings`, { credentials: "include" }),
      ]);
      if (!secretsRes.ok) throw new Error("Failed to load");
      const data = (await secretsRes.json()) as ChargilySecretsState;
      setState(data);
      if (settingsRes.ok) {
        const s = (await settingsRes.json()) as { enabled?: boolean; mode?: "test" | "live" };
        setEnabled(s.enabled !== false);
        setMode(s.mode ?? "test");
      }
    } catch {
      toast({ title: "Error", description: "Could not load Chargily settings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (checked: boolean) => {
    setTogglingEnabled(true);
    const prev = enabled;
    setEnabled(checked);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/chargily/settings`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({
        title: checked ? "Top-ups enabled" : "Top-ups disabled",
        description: checked
          ? "Users can now pay via Chargily."
          : "Chargily top-ups are now blocked. Existing pending checkouts can still be paid.",
      });
    } catch {
      setEnabled(prev);
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    } finally {
      setTogglingEnabled(false);
    }
  };

  const handleToggleMode = async (live: boolean) => {
    const newMode = live ? "live" : "test";
    const prev = mode;
    setMode(newMode);
    setTogglingMode(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/chargily/settings`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Mode updated", description: `Chargily is now in ${newMode.toUpperCase()} mode.` });
    } catch {
      setMode(prev);
      toast({ title: "Error", description: "Failed to update mode", variant: "destructive" });
    } finally {
      setTogglingMode(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSave = async () => {
    const payload: Record<string, string> = {};
    if (secretKey.trim()) payload.secretKey = secretKey.trim();
    if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
    if (Object.keys(payload).length === 0) {
      toast({ title: "Nothing to save", description: "Enter at least one key.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/chargily/secrets`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Save failed");
      }
      const data = (await res.json()) as ChargilySecretsState;
      setState(data); setSecretKey(""); setWebhookSecret("");
      toast({ title: "Saved", description: "Chargily keys updated." });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const copyWebhookUrl = async () => {
    if (!state?.webhookUrl) return;
    await navigator.clipboard.writeText(state.webhookUrl).catch(() => {});
    toast({ title: "Copied", description: "Webhook URL copied to clipboard." });
  };

  const sourceLabel = (src: "db" | "env" | "missing"): { text: string; cls: string } => {
    if (src === "db") return { text: "Saved (database)", cls: "text-green-600" };
    if (src === "env") return { text: "From environment variable", cls: "text-blue-600" };
    return { text: "Not configured", cls: "text-destructive" };
  };

  return (
    <Card data-testid="card-chargily-secrets">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <CardTitle>Chargily Pay — API Keys</CardTitle>
        </div>
        <CardDescription>
          Configure the Chargily secret key and webhook secret used for DZD top-ups. Values are stored encrypted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : state ? (
          <>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Power className={`h-4 w-4 ${enabled ? "text-green-600" : "text-muted-foreground"}`} />
                  <div>
                    <div className="text-sm font-medium">{enabled ? "Top-ups enabled" : "Top-ups disabled"}</div>
                    <p className="text-xs text-muted-foreground">Master switch — disable without removing keys.</p>
                  </div>
                </div>
                <Switch checked={enabled} onCheckedChange={handleToggleEnabled} disabled={togglingEnabled} data-testid="switch-chargily-enabled" />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Mode</span>
                <div className="flex items-center gap-3">
                  <span className={mode === "live" ? "text-amber-600 font-semibold" : "text-muted-foreground"}>
                    {mode.toUpperCase()}
                  </span>
                  <Switch checked={mode === "live"} onCheckedChange={handleToggleMode} disabled={togglingMode} data-testid="switch-chargily-mode" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Toggle to switch between test and live mode.</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhook URL</Label>
              <div className="flex gap-2">
                <Input value={state.webhookUrl} readOnly className="font-mono text-xs" data-testid="input-chargily-webhook-url" />
                <Button variant="outline" onClick={copyWebhookUrl} data-testid="button-copy-webhook-url">
                  <Copy className="h-4 w-4 mr-2" /> Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Paste this in your Chargily dashboard.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chargily-secret-key">CHARGILY_SECRET_KEY</Label>
              <p className={`text-xs ${sourceLabel(state.secretKeySource).cls}`}>Status: {sourceLabel(state.secretKeySource).text}</p>
              <Input
                id="chargily-secret-key" type="password" autoComplete="off"
                placeholder={state.hasSecretKey ? "•••••••• (leave empty to keep current)" : "test_sk_... or live_sk_..."}
                value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
                data-testid="input-chargily-secret-key"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chargily-webhook-secret">CHARGILY_WEBHOOK_SECRET</Label>
              <p className={`text-xs ${sourceLabel(state.webhookSecretSource).cls}`}>Status: {sourceLabel(state.webhookSecretSource).text}</p>
              <Input
                id="chargily-webhook-secret" type="password" autoComplete="off"
                placeholder={state.hasWebhookSecret ? "•••••••• (leave empty to keep current)" : "whsec_..."}
                value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)}
                data-testid="input-chargily-webhook-secret"
              />
            </div>

            <Button onClick={handleSave} disabled={saving} data-testid="button-save-chargily-secrets">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Chargily Keys
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChargilyIntentsCard() {
  const { toast } = useToast();
  const [intents, setIntents] = useState<ChargilyIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fulfilling, setFulfilling] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/chargily/intents?status=pending&limit=50`, { credentials: "include" });
      const data = (await res.json()) as ChargilyIntent[];
      setIntents(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Error", description: "Could not load payment intents", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const fulfill = async (id: number) => {
    if (!confirm(`Manually fulfill intent #${id}? This will upgrade the plan or credit the user as if the webhook was received.`)) return;
    setFulfilling(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/chargily/intents/${id}/fulfill`, { method: "POST", credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) toast({ title: "Error", description: data.error ?? "Fulfill failed", variant: "destructive" });
      else { toast({ title: "Done", description: data.message ?? "Intent fulfilled" }); void load(); }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally { setFulfilling(null); }
  };

  const purposeOf = (intent: ChargilyIntent) => {
    try {
      const m = intent.metadata ? JSON.parse(intent.metadata) as { purpose?: string; planName?: string } : null;
      if (m?.purpose === "plan_upgrade") return `Plan upgrade${m.planName ? ` (${m.planName})` : ""}`;
    } catch { /* */ }
    return "Top-up";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Pending Chargily Intents
        </CardTitle>
        <CardDescription>
          Payments confirmed by Chargily but not yet processed by webhook. Use "Fulfill" to manually credit the user.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : intents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No pending intents — all payments have been processed.</p>
        ) : (
          <div className="space-y-3">
            {intents.map((intent) => (
              <div key={intent.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">Intent #{intent.id}</span>
                    <Badge variant="outline" className="text-xs">{intent.mode}</Badge>
                    <Badge variant="secondary" className="text-xs">{purposeOf(intent)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    User #{intent.userId} · {intent.amountDzd.toLocaleString()} DZD · ${Number(intent.amountUsd).toFixed(4)} USD
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(intent.createdAt).toLocaleString()}</div>
                </div>
                <Button size="sm" onClick={() => void fulfill(intent.id)} disabled={fulfilling === intent.id}>
                  {fulfilling === intent.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Fulfill
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Spaceremit ───────────────────────────────────────────────────────────────

interface SpaceremitKeysState {
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  publicKeySource: "db" | "env" | "none";
  privateKeySource: "db" | "env" | "none";
  callbackUrl: string;
}

interface SpaceremitAdminSettings {
  enabled: boolean;
  mode: "test" | "live";
  minTopupUsd: number;
  maxTopupUsd: number;
}

interface SpaceremitPaymentIntent {
  id: number;
  userId: number;
  spaceremitPaymentId: string | null;
  amountUsd: string;
  status: string;
  mode: string;
  metadata: string | null;
  createdAt: string;
}

function SpaceremitSecretsCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [keysState, setKeysState] = useState<SpaceremitKeysState | null>(null);
  const [settings, setSettings] = useState<SpaceremitAdminSettings | null>(null);
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [keysRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/billing/spaceremit/keys`, { credentials: "include" }),
        fetch(`${API_BASE}/api/admin/billing/spaceremit/settings`, { credentials: "include" }),
      ]);
      if (!keysRes.ok) throw new Error("Failed to load Spaceremit keys");
      setKeysState((await keysRes.json()) as SpaceremitKeysState);
      if (settingsRes.ok) setSettings((await settingsRes.json()) as SpaceremitAdminSettings);
    } catch {
      toast({ title: "Error", description: "Could not load Spaceremit settings", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleToggleEnabled = async (checked: boolean) => {
    setTogglingEnabled(true);
    const prev = settings?.enabled;
    setSettings(s => s ? { ...s, enabled: checked } : s);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/spaceremit/settings`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: checked }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: checked ? "Top-ups enabled" : "Top-ups disabled", description: checked ? "Users can now pay via Spaceremit." : "Spaceremit top-ups are now blocked." });
    } catch {
      setSettings(s => s ? { ...s, enabled: prev ?? false } : s);
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    } finally { setTogglingEnabled(false); }
  };

  const handleToggleMode = async (live: boolean) => {
    const mode = live ? "live" : "test";
    setSettings(s => s ? { ...s, mode } : s);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/spaceremit/settings`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Mode updated", description: `Spaceremit is now in ${mode.toUpperCase()} mode.` });
    } catch {
      toast({ title: "Error", description: "Failed to update mode", variant: "destructive" });
    }
  };

  const handleSaveKeys = async () => {
    const payload: Record<string, string> = {};
    if (publicKey.trim()) payload.publicKey = publicKey.trim();
    if (privateKey.trim()) payload.privateKey = privateKey.trim();
    if (Object.keys(payload).length === 0) {
      toast({ title: "Nothing to save", description: "Enter at least one key.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/spaceremit/keys`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Save failed");
      }
      setKeysState((await res.json()) as SpaceremitKeysState);
      setPublicKey(""); setPrivateKey("");
      toast({ title: "Saved", description: "Spaceremit keys updated." });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Save failed", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const copyCallbackUrl = async () => {
    if (!keysState?.callbackUrl) return;
    await navigator.clipboard.writeText(keysState.callbackUrl).catch(() => {});
    toast({ title: "Copied", description: "Callback URL copied to clipboard." });
  };

  const srcLabel = (src: "db" | "env" | "none"): { text: string; cls: string } => {
    if (src === "db") return { text: "Saved (database)", cls: "text-green-600" };
    if (src === "env") return { text: "From environment variable", cls: "text-blue-600" };
    return { text: "Not configured", cls: "text-destructive" };
  };

  return (
    <Card data-testid="card-spaceremit-secrets">
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <CardTitle>Spaceremit — API Keys</CardTitle>
        </div>
        <CardDescription>Configure Spaceremit public and private keys for USD top-ups. Private key is stored encrypted.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : keysState ? (
          <>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Power className={`h-4 w-4 ${settings?.enabled ? "text-green-600" : "text-muted-foreground"}`} />
                  <div>
                    <div className="text-sm font-medium">{settings?.enabled ? "Top-ups enabled" : "Top-ups disabled"}</div>
                    <p className="text-xs text-muted-foreground">Master switch for Spaceremit payments.</p>
                  </div>
                </div>
                <Switch checked={settings?.enabled ?? false} onCheckedChange={handleToggleEnabled} disabled={togglingEnabled} data-testid="switch-spaceremit-enabled" />
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Mode</span>
                <div className="flex items-center gap-3">
                  <span className={settings?.mode === "live" ? "text-amber-600 font-semibold" : "text-muted-foreground"}>
                    {(settings?.mode ?? "test").toUpperCase()}
                  </span>
                  <Switch checked={settings?.mode === "live"} onCheckedChange={handleToggleMode} data-testid="switch-spaceremit-mode" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Toggle to switch between test and live mode.</p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Callback URL</Label>
              <div className="flex gap-2">
                <Input value={keysState.callbackUrl} readOnly className="font-mono text-xs" data-testid="input-spaceremit-callback-url" />
                <Button variant="outline" onClick={copyCallbackUrl} data-testid="button-copy-spaceremit-callback-url">
                  <Copy className="h-4 w-4 mr-2" /> Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Paste this in your Spaceremit dashboard (optional but recommended).</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sp-public-key">SPACEREMIT_PUBLIC_KEY</Label>
              <p className={`text-xs ${srcLabel(keysState.publicKeySource).cls}`}>Status: {srcLabel(keysState.publicKeySource).text}</p>
              <Input id="sp-public-key" type="text" autoComplete="off"
                placeholder={keysState.hasPublicKey ? "•••••••• (leave empty to keep current)" : "pk_..."}
                value={publicKey} onChange={(e) => setPublicKey(e.target.value)}
                data-testid="input-spaceremit-public-key"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sp-private-key">SPACEREMIT_PRIVATE_KEY</Label>
              <p className={`text-xs ${srcLabel(keysState.privateKeySource).cls}`}>Status: {srcLabel(keysState.privateKeySource).text}</p>
              <Input id="sp-private-key" type="password" autoComplete="off"
                placeholder={keysState.hasPrivateKey ? "•••••••• (leave empty to keep current)" : "priv_..."}
                value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                data-testid="input-spaceremit-private-key"
              />
            </div>

            <Button onClick={handleSaveKeys} disabled={saving} data-testid="button-save-spaceremit-keys">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Spaceremit Keys
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SpaceremitIntentsCard() {
  const { toast } = useToast();
  const [intents, setIntents] = useState<SpaceremitPaymentIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fulfilling, setFulfilling] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/spaceremit/intents?status=pending&limit=50`, { credentials: "include" });
      const data = (await res.json()) as SpaceremitPaymentIntent[];
      setIntents(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Error", description: "Could not load Spaceremit intents", variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const fulfill = async (id: number) => {
    if (!confirm(`Manually fulfill Spaceremit intent #${id}? This will credit the user as if the payment was verified.`)) return;
    setFulfilling(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/billing/spaceremit/intents/${id}/fulfill`, { method: "POST", credentials: "include" });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) toast({ title: "Error", description: data.error ?? "Fulfill failed", variant: "destructive" });
      else { toast({ title: "Done", description: data.message ?? "Intent fulfilled" }); void load(); }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally { setFulfilling(null); }
  };

  const purposeOf = (intent: SpaceremitPaymentIntent) => {
    try {
      const m = intent.metadata ? JSON.parse(intent.metadata) as { purpose?: string; planName?: string } : null;
      if (m?.purpose === "plan_upgrade") return `Plan upgrade${m.planName ? ` (${m.planName})` : ""}`;
    } catch { /* */ }
    return "Top-up";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Pending Spaceremit Intents
        </CardTitle>
        <CardDescription>
          Pending Spaceremit payment intents. Use "Fulfill" to manually credit the user if auto-verification didn't trigger.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : intents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No pending Spaceremit intents.</p>
        ) : (
          <div className="space-y-3">
            {intents.map((intent) => (
              <div key={intent.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">Intent #{intent.id}</span>
                    <Badge variant="outline" className="text-xs">{intent.mode}</Badge>
                    <Badge variant="secondary" className="text-xs">{purposeOf(intent)}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    User #{intent.userId} · ${Number(intent.amountUsd).toFixed(2)} USD
                  </div>
                  {intent.spaceremitPaymentId && (
                    <div className="text-xs text-muted-foreground font-mono">ID: {intent.spaceremitPaymentId}</div>
                  )}
                  <div className="text-xs text-muted-foreground">{new Date(intent.createdAt).toLocaleString()}</div>
                </div>
                <Button size="sm" onClick={() => void fulfill(intent.id)} disabled={fulfilling === intent.id}>
                  {fulfilling === intent.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Fulfill
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPayments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          Payments
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage payment gateway credentials, enable/disable gateways, and reconcile pending transactions.
        </p>
      </div>

      <Tabs defaultValue="chargily">
        <TabsList className="mb-4">
          <TabsTrigger value="chargily">Chargily Pay (DZD)</TabsTrigger>
          <TabsTrigger value="spaceremit">Spaceremit (USD)</TabsTrigger>
        </TabsList>

        <TabsContent value="chargily" className="space-y-6">
          <ChargilySecretsCard />
          <ChargilyIntentsCard />
        </TabsContent>

        <TabsContent value="spaceremit" className="space-y-6">
          <SpaceremitSecretsCard />
          <SpaceremitIntentsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
