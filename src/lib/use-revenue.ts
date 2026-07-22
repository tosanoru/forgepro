"use client";

import useSWR from "swr";
import { useWorkspace } from "@/lib/use-workspace";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface RevenueEntry {
  id: string;
  workspaceId: string;
  source: "stripe" | "paystack" | "flutterwave" | "youtube_adsense" | "sponsorship" | "other";
  description: string;
  amountCents: number;
  currency: string;
  occurredOn: string;
  externalId: string | null;
  createdBy: string;
  createdAt: string;
}

export function useRevenue() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<{ entries: RevenueEntry[] }>(
    workspace ? `/api/workspace/${workspace.id}/revenue` : null,
    fetcher,
  );

  async function addEntry(input: {
    source: "youtube_adsense" | "sponsorship" | "other";
    description?: string;
    amountCents: number;
    occurredOn: string;
  }) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch(`/api/workspace/${workspace.id}/revenue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to add entry");
    await mutate();
    return json.entry as RevenueEntry;
  }

  async function removeEntry(entryId: string) {
    const res = await fetch(`/api/revenue/${entryId}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete");
    await mutate();
  }

  return { entries: data?.entries ?? [], loading: isLoading, error, addEntry, removeEntry, mutate };
}

export type PaymentProvider = "stripe" | "paystack" | "flutterwave";

interface PaymentConnectionStatus {
  connected: boolean;
  keyLast4: string | null;
}

/**
 * Generalized from the original useStripeConnection — same shape, now
 * parameterized so the same hook drives Stripe, Paystack, and Flutterwave
 * connection cards without three near-identical copies.
 */
export function usePaymentConnection(provider: PaymentProvider) {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<PaymentConnectionStatus>(
    workspace ? `/api/workspace/${workspace.id}/revenue/${provider}` : null,
    fetcher,
  );

  async function connect(apiKey: string) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch(`/api/workspace/${workspace.id}/revenue/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `Failed to connect ${provider}`);
    await mutate();
    return json;
  }

  async function disconnect() {
    if (!workspace) return;
    const res = await fetch(`/api/workspace/${workspace.id}/revenue/${provider}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to disconnect");
    await mutate();
  }

  async function sync() {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch(`/api/workspace/${workspace.id}/revenue/${provider}/sync`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Sync failed");
    return json as { count: number };
  }

  return { status: data, loading: isLoading, error, connect, disconnect, sync };
}
