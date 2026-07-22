"use client";

import useSWR from "swr";
import { useWorkspace } from "@/lib/use-workspace";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface Thumbnail {
  id: string;
  workspaceId: string;
  prompt: string;
  r2Key: string;
  url: string;
  contentCardId: string | null;
  createdBy: string;
  createdAt: string;
}

export function useThumbnails() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<{ thumbnails: Thumbnail[] }>(
    workspace ? `/api/thumbnails?workspaceId=${workspace.id}` : null,
    fetcher,
  );

  async function generate(prompt: string): Promise<Thumbnail> {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch("/api/thumbnails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, prompt }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to generate thumbnail");
    await mutate();
    return json.thumbnail;
  }

  async function remove(id: string) {
    const res = await fetch(`/api/thumbnails/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete");
    await mutate();
  }

  /** Sets or clears which content card this thumbnail belongs to — see PATCH /api/thumbnails/[id]. */
  async function setContentCard(id: string, contentCardId: string | null) {
    const res = await fetch(`/api/thumbnails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentCardId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to update card link");
    await mutate();
  }

  return { thumbnails: data?.thumbnails ?? [], loading: isLoading, error, generate, remove, setContentCard, mutate };
}

interface ImageSettingsStatus {
  connected: boolean;
  provider: string;
  keyLast4: string | null;
  monthlyBudgetCents: number | null;
}

export function useImageSettings() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<ImageSettingsStatus>(
    workspace ? `/api/workspace/${workspace.id}/image-settings` : null,
    fetcher,
  );

  async function connect(apiKey: string, provider?: string) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch(`/api/workspace/${workspace.id}/image-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, provider: provider ?? "openai" }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to connect");
    await mutate();
    return json;
  }

  async function disconnect() {
    if (!workspace) return;
    const res = await fetch(`/api/workspace/${workspace.id}/image-settings`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to disconnect");
    await mutate();
  }

  /** Pass null to remove the budget cap entirely — the count-based plan limit still applies either way. */
  async function setBudget(monthlyBudgetCents: number | null) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch(`/api/workspace/${workspace.id}/image-settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyBudgetCents }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to update budget");
    await mutate();
  }

  return { status: data, loading: isLoading, error, connect, disconnect, setBudget };
}
