"use client";

import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useRevenue, usePaymentConnection, type PaymentProvider } from "@/lib/use-revenue";
import { useWorkspace } from "@/lib/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CreditCard, Plus, RefreshCw, Trash2, TrendingUp, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const SOURCE_LABEL: Record<string, string> = {
  stripe: "Client billing (Stripe)",
  paystack: "Client billing (Paystack)",
  flutterwave: "Client billing (Flutterwave)",
  youtube_adsense: "YouTube AdSense",
  sponsorship: "Sponsorship",
  other: "Other",
};

const PROVIDER_META: Record<PaymentProvider, { label: string; keyPlaceholder: string; keyUrl: string }> = {
  stripe: { label: "Stripe", keyPlaceholder: "sk_live_...", keyUrl: "https://dashboard.stripe.com/apikeys" },
  paystack: { label: "Paystack", keyPlaceholder: "sk_live_...", keyUrl: "https://dashboard.paystack.com/#/settings/developers" },
  flutterwave: { label: "Flutterwave", keyPlaceholder: "FLWSECK-...", keyUrl: "https://app.flutterwave.com/dashboard/settings/apis" },
};

function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export default function RevenuePage() {
  const { role } = useWorkspace();
  const { entries, loading, addEntry, removeEntry } = useRevenue();
  const stripeConn = usePaymentConnection("stripe");
  const paystackConn = usePaymentConnection("paystack");
  const flutterwaveConn = usePaymentConnection("flutterwave");
  const connections = { stripe: stripeConn, paystack: paystackConn, flutterwave: flutterwaveConn } as const;
  const connectedCount = Object.values(connections).filter((c) => c.status?.connected).length;

  const [entryOpen, setEntryOpen] = useState(false);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<PaymentProvider | null>(null);
  const [syncing, setSyncing] = useState<PaymentProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [providerKey, setProviderKey] = useState("");

  const [source, setSource] = useState<"youtube_adsense" | "sponsorship" | "other">("youtube_adsense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const canManage = role === "owner" || role === "admin";

  const { totalsByCurrency, bySourceGrouped, chartData, chartCurrency, hasMixedCurrencies } = useMemo(() => {
    const now = new Date();
    const monthPrefix = now.toISOString().slice(0, 7);
    const totals: Record<string, number> = {};
    // Keyed "source:currency" — a source total can't be a single number
    // once entries in different currencies exist under it (e.g. Stripe
    // charging some clients in USD and others in NGN).
    const sourceTotals: Record<string, number> = {};
    const byMonthByCurrency: Record<string, Record<string, number>> = {};
    const currencyCounts: Record<string, number> = {};

    for (const e of entries) {
      const currency = e.currency || "usd";
      currencyCounts[currency] = (currencyCounts[currency] ?? 0) + 1;

      if (e.occurredOn.startsWith(monthPrefix)) {
        totals[currency] = (totals[currency] ?? 0) + e.amountCents;
      }
      const sourceKey = `${e.source}:${currency}`;
      sourceTotals[sourceKey] = (sourceTotals[sourceKey] ?? 0) + e.amountCents;

      const month = e.occurredOn.slice(0, 7);
      byMonthByCurrency[currency] ??= {};
      byMonthByCurrency[currency][month] = (byMonthByCurrency[currency][month] ?? 0) + e.amountCents;
    }

    // The monthly trend chart is a single bar series — summing across
    // currencies there would silently misrepresent the numbers the same
    // way the old single `total` did everywhere else, so instead of
    // fixing that by summing anyway, only the workspace's most common
    // currency gets charted. Workspaces that are genuinely single-currency
    // (the common case) see no difference at all.
    const dominantCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "usd";
    const chart = Object.entries(byMonthByCurrency[dominantCurrency] ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, cents]) => ({ month, amount: cents / 100 }));

    // Re-grouped "source:currency" → one entry per source, each with its
    // own list of [currency, cents] pairs — computed once here rather
    // than in JSX, where the previous version accidentally computed it
    // twice.
    const bySourceGrouped = Object.entries(sourceTotals).reduce<Record<string, Array<[string, number]>>>((acc, [key, cents]) => {
      const [src, currency] = key.split(":");
      (acc[src] ??= []).push([currency, cents]);
      return acc;
    }, {});

    return {
      totalsByCurrency: totals,
      bySourceGrouped,
      chartData: chart,
      chartCurrency: dominantCurrency,
      hasMixedCurrencies: Object.keys(currencyCounts).length > 1,
    };
  }, [entries]);

  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (!cents || Number.isNaN(cents)) return;
    setSaving(true);
    try {
      await addEntry({ source, description: description.trim(), amountCents: cents, occurredOn });
      setDescription("");
      setAmount("");
      setEntryOpen(false);
      toast.success("Entry added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setSaving(false);
    }
  };

  const submitProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProvider) return;
    setConnecting(true);
    try {
      await connections[activeProvider].connect(providerKey.trim());
      setProviderKey("");
      toast.success(`${PROVIDER_META[activeProvider].label} connected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const runSync = async (provider: PaymentProvider) => {
    setSyncing(provider);
    try {
      const result = await connections[provider].sync();
      toast.success(`Synced ${result.count} transactions from ${PROVIDER_META[provider].label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 07 · REVENUE"
        title="Revenue"
        subtitle="Client billing synced from Stripe, everything else logged by hand."
        action={
          <div className="flex gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => setProviderPickerOpen(true)}>
                <CreditCard className="h-4 w-4" /> {connectedCount > 0 ? `${connectedCount} connected` : "Connect billing"}
              </Button>
            )}
            <Button onClick={() => setEntryOpen(true)}>
              <Plus className="h-4 w-4" /> Log revenue
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading revenue…
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <CardDescription>This month</CardDescription>
                </div>
                {Object.keys(totalsByCurrency).length === 0 ? (
                  <CardTitle className="font-mono text-2xl">{formatMoney(0)}</CardTitle>
                ) : (
                  <div className="space-y-0.5">
                    {Object.entries(totalsByCurrency).map(([currency, cents]) => (
                      <CardTitle key={currency} className="font-mono text-2xl">
                        {formatMoney(cents, currency)}
                      </CardTitle>
                    ))}
                  </div>
                )}
              </CardHeader>
            </Card>
            {Object.entries(bySourceGrouped).map(([src, byCurrency]) => (
              <Card key={src}>
                <CardHeader>
                  <CardDescription>{SOURCE_LABEL[src] ?? src}</CardDescription>
                  <div className="space-y-0.5">
                    {byCurrency.map(([currency, cents]) => (
                      <CardTitle key={currency} className="font-mono text-2xl">
                        {formatMoney(cents, currency)}
                      </CardTitle>
                    ))}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          {hasMixedCurrencies && (
            <p className="text-xs text-muted-foreground">
              This workspace has revenue in more than one currency — totals above are shown per-currency rather than summed together, and the
              trend chart below reflects {chartCurrency.toUpperCase()} only.
            </p>
          )}

          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Last 6 months {hasMixedCurrencies && `(${chartCurrency.toUpperCase()})`}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <YAxis
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickFormatter={(v) => formatMoney(v * 100, chartCurrency).replace(/\.00$/, "")}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatMoney(value * 100, chartCurrency), "Revenue"]}
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
                      />
                      <Bar dataKey="amount" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="border border-border bg-card">
            <div className="border-b border-border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Recent entries
            </div>
            <ul className="divide-y divide-border">
              {entries.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted-foreground">No revenue logged yet.</li>}
              {entries.slice(0, 25).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.description || SOURCE_LABEL[e.source]}</div>
                    <div className="text-xs text-muted-foreground">
                      {SOURCE_LABEL[e.source]} · {e.occurredOn}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono font-semibold">{formatMoney(e.amountCents, e.currency)}</span>
                    {!e.externalId && (
                      <button onClick={() => removeEntry(e.id)} className="text-muted-foreground hover:text-rose-stat">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Log revenue dialog */}
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log revenue</DialogTitle>
            <DialogDescription>For anything that doesn&apos;t come through Stripe — AdSense, sponsorships, one-off deals.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEntry} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube_adsense">YouTube AdSense</SelectItem>
                  <SelectItem value="sponsorship">Sponsorship</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rev-desc">Description</Label>
              <Input id="rev-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. October AdSense payout" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rev-amount">Amount (USD)</Label>
                <Input id="rev-amount" type="number" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rev-date">Date</Label>
                <Input id="rev-date" type="date" required value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Adding…" : "Add entry"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Provider picker — list of Stripe/Paystack/Flutterwave with connection status */}
      <Dialog open={providerPickerOpen} onOpenChange={setProviderPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Billing providers</DialogTitle>
            <DialogDescription>Connect any combination — useful if you bill some clients in USD and others in NGN.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(Object.keys(PROVIDER_META) as PaymentProvider[]).map((p) => {
              const conn = connections[p];
              return (
                <button
                  key={p}
                  onClick={() => {
                    setActiveProvider(p);
                    setProviderPickerOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded border border-border p-3 text-left transition hover:border-primary/40"
                >
                  <span className="text-sm font-medium">{PROVIDER_META[p].label}</span>
                  {conn.status?.connected ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-stat">
                      <CheckCircle2 className="h-3.5 w-3.5" /> ••{conn.status.keyLast4}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not connected</span>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Per-provider connect/manage dialog */}
      <Dialog open={!!activeProvider} onOpenChange={(open) => !open && setActiveProvider(null)}>
        {activeProvider && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{PROVIDER_META[activeProvider].label}</DialogTitle>
              <DialogDescription>Syncs client billing into your revenue ledger — nets out refunds automatically.</DialogDescription>
            </DialogHeader>
            {connections[activeProvider].status?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded border border-emerald-stat/30 bg-emerald-stat/5 p-3 text-sm text-emerald-stat">
                  <CheckCircle2 className="h-4 w-4" /> Connected — key ending in {connections[activeProvider].status?.keyLast4}
                </div>
                <Button onClick={() => runSync(activeProvider)} disabled={syncing === activeProvider} className="w-full">
                  {syncing === activeProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {syncing === activeProvider ? "Syncing…" : "Sync now"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full text-rose-stat hover:text-rose-stat"
                  onClick={async () => {
                    await connections[activeProvider].disconnect();
                    toast.success("Disconnected");
                  }}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <form onSubmit={submitProvider} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="provider-key">Secret key</Label>
                    <a
                      href={PROVIDER_META[activeProvider].keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Get a key
                    </a>
                  </div>
                  <Input
                    id="provider-key"
                    type="password"
                    required
                    autoComplete="off"
                    placeholder={PROVIDER_META[activeProvider].keyPlaceholder}
                    value={providerKey}
                    onChange={(e) => setProviderKey(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={connecting} className="w-full">
                  {connecting ? "Connecting…" : "Connect"}
                </Button>
              </form>
            )}
          </DialogContent>
        )}
      </Dialog>
    </AppShell>
  );
}
