"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useBilling } from "@/lib/use-billing";
import { useWorkspace } from "@/lib/use-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Check, CreditCard, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { PlanTier } from "@/lib/plan-limits";

const TIER_ORDER: PlanTier[] = ["free", "lite", "pro"];

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const isUnlimited = !Number.isFinite(limit);
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const nearLimit = !isUnlimited && pct >= 80;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{isUnlimited ? `${used} used` : `${used} / ${limit}`}</span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${nearLimit ? "bg-rose-stat" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function BillingContent() {
  const searchParams = useSearchParams();
  const { role } = useWorkspace();
  const { status, loading, upgrade, manageBilling } = useBilling();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const canManage = role === "owner" || role === "admin";
  const checkoutResult = searchParams.get("checkout");

  const handleUpgrade = async (tier: Exclude<PlanTier, "free">) => {
    setActionLoading(tier);
    try {
      await upgrade(tier);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
      setActionLoading(null);
    }
  };

  const handleManage = async () => {
    setActionLoading("manage");
    try {
      await manageBilling();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open billing portal");
      setActionLoading(null);
    }
  };

  if (loading || !status) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading billing…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {checkoutResult === "success" && (
        <div className="flex items-center gap-2 rounded border border-emerald-stat/30 bg-emerald-stat/5 p-3 text-sm text-emerald-stat">
          <Check className="h-4 w-4" /> Payment received — your plan updates within a few seconds of Stripe's webhook arriving.
        </div>
      )}

      <div>
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">This month&rsquo;s usage</h2>
        <Card>
          <CardContent className="grid grid-cols-1 gap-5 pt-6 sm:grid-cols-2">
            <UsageBar label="Team members" used={status.usage.teamMembers} limit={status.limits.teamMembers} />
            <UsageBar label="Video uploads" used={status.usage.videoUploads} limit={status.limits.videoUploads} />
            <UsageBar label="Script generations" used={status.usage.scriptGenerationsThisMonth} limit={status.limits.scriptGenerationsPerMonth} />
            <UsageBar label="Thumbnail generations" used={status.usage.thumbnailGenerationsThisMonth} limit={status.limits.thumbnailGenerationsPerMonth} />
            <UsageBar label="Brand asset storage (MB)" used={status.usage.brandAssetStorageMB} limit={status.limits.brandAssetStorageMB} />
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">Plans</h2>
          {status.hasBillingHistory && canManage && (
            <Button variant="outline" size="sm" onClick={handleManage} disabled={actionLoading === "manage"}>
              <CreditCard className="h-3.5 w-3.5" /> Manage billing
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TIER_ORDER.map((tier) => {
            const limits = status.allPlans[tier];
            const isCurrent = tier === status.tier;
            return (
              <Card key={tier} className={isCurrent ? "border-primary/50" : undefined}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {tier === "pro" && <Sparkles className="h-4 w-4 text-primary" />}
                    <CardTitle>{limits.label}</CardTitle>
                  </div>
                  <CardDescription>
                    {limits.priceUsdMonthly === null ? "Free forever" : `$${limits.priceUsdMonthly}/month`}
                  </CardDescription>
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <li>{Number.isFinite(limits.teamMembers) ? limits.teamMembers : "Unlimited"} team members</li>
                    <li>{Number.isFinite(limits.videoUploads) ? limits.videoUploads : "Unlimited"} videos</li>
                    <li>{Number.isFinite(limits.scriptGenerationsPerMonth) ? `${limits.scriptGenerationsPerMonth}/mo` : "Unlimited"} scripts</li>
                    <li>{limits.brandAssetStorageMB.toLocaleString()}MB storage</li>
                    <li>
                      Niche Finder: {limits.nicheFinder.tracking ? "tracking + filters" : "browse top 20"}
                      {limits.nicheFinder.mcpAccess ? " + MCP access" : ""}
                    </li>
                  </ul>
                </CardHeader>
                <CardContent>
                  {isCurrent ? (
                    <div className="rounded border border-dashed border-border py-2 text-center text-xs text-muted-foreground">
                      Current plan
                    </div>
                  ) : tier === "free" ? null : canManage ? (
                    <Button
                      className="w-full"
                      variant={tier === "pro" ? "default" : "outline"}
                      onClick={() => handleUpgrade(tier as Exclude<PlanTier, "free">)}
                      disabled={actionLoading === tier}
                    >
                      {actionLoading === tier ? "Redirecting…" : `Upgrade to ${limits.label}`}
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">Ask a workspace admin to upgrade.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="№ 00 · BILLING" title="Billing" subtitle="What your workspace is on, and what's included at each tier." />
      <Suspense fallback={<div className="h-64" />}>
        <BillingContent />
      </Suspense>
    </AppShell>
  );
}
