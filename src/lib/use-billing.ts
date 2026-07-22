"use client";

import useSWR from "swr";
import { useWorkspace } from "@/lib/use-workspace";
import type { PlanTier, PlanLimits } from "@/lib/plan-limits";
import type { PlanUsage } from "@/lib/plan-usage";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BillingStatus {
  tier: PlanTier;
  usage: PlanUsage;
  limits: PlanLimits;
  allPlans: Record<PlanTier, PlanLimits>;
  hasBillingHistory: boolean;
}

export function useBilling() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<BillingStatus>(
    workspace ? `/api/billing/status?workspaceId=${workspace.id}` : null,
    fetcher,
  );

  async function upgrade(tier: Exclude<PlanTier, "free">) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, tier }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to start checkout");
    window.location.href = json.url;
  }

  async function manageBilling() {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to open billing portal");
    window.location.href = json.url;
  }

  return { status: data, loading: isLoading, error, upgrade, manageBilling, mutate };
}
