"use client";

import useSWR from "swr";
import { useWorkspace } from "@/lib/use-workspace";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface Niche {
  id: string;
  name: string;
  category: string;
  estimatedRpmLow: string | null;
  estimatedRpmHigh: string | null;
  competitionScore: number | null;
  growthScore: number | null;
  updatedAt: string;
}

export interface Channel {
  id: string;
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  isFaceless: boolean;
  country: string | null;
}

export interface ChannelSnapshot {
  id: string;
  channelId: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  uploadsLast30d: number | null;
  avgViewsLast10: number | null;
  snapshotDate: string;
}

export function useNiches(filters?: { category?: string; minGrowthScore?: number; maxCompetitionScore?: number; minRpm?: number; q?: string }) {
  const { workspace } = useWorkspace();
  const params = new URLSearchParams();
  if (workspace) params.set("workspaceId", workspace.id);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.minGrowthScore !== undefined) params.set("minGrowthScore", String(filters.minGrowthScore));
  if (filters?.maxCompetitionScore !== undefined) params.set("maxCompetitionScore", String(filters.maxCompetitionScore));
  if (filters?.minRpm !== undefined) params.set("minRpm", String(filters.minRpm));
  if (filters?.q) params.set("q", filters.q);

  const { data, error, isLoading, mutate } = useSWR<{ niches: Niche[]; tier: string; limited: boolean }>(
    workspace ? `/api/niche-finder/niches?${params.toString()}` : null,
    fetcher,
  );

  return { niches: data?.niches ?? [], tier: data?.tier ?? "free", limited: data?.limited ?? false, loading: isLoading, error, mutate };
}

export function useNicheDetail(nicheId: string | null) {
  const { workspace } = useWorkspace();
  const { data, error, isLoading } = useSWR<{ niche: Niche; channels: (Channel & { latestSnapshot: ChannelSnapshot | null })[] }>(
    workspace && nicheId ? `/api/niche-finder/niches/${nicheId}?workspaceId=${workspace.id}` : null,
    fetcher,
  );
  return { niche: data?.niche ?? null, channels: data?.channels ?? [], loading: isLoading, error };
}

export function useChannelDetail(channelId: string | null) {
  const { workspace } = useWorkspace();
  const { data, error, isLoading } = useSWR<{ channel: Channel; latestSnapshot: ChannelSnapshot | null }>(
    workspace && channelId ? `/api/niche-finder/channels/${channelId}?workspaceId=${workspace.id}` : null,
    fetcher,
  );

  const { data: historyData } = useSWR<{ snapshots: ChannelSnapshot[] }>(
    workspace && channelId ? `/api/niche-finder/channels/${channelId}/history?workspaceId=${workspace.id}&days=90` : null,
    fetcher,
  );

  return { channel: data?.channel ?? null, latestSnapshot: data?.latestSnapshot ?? null, history: historyData?.snapshots ?? [], loading: isLoading, error };
}

export interface TrackedChannel {
  id: string;
  workspaceId: string;
  channelId: string;
  trackedBy: string;
  notifyOnGrowthSpike: boolean;
  createdAt: string;
  channel: Channel;
}

export function useTrackedChannels() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<{ tracked: TrackedChannel[] }>(
    workspace ? `/api/niche-finder/tracked-channels?workspaceId=${workspace.id}` : null,
    fetcher,
  );

  async function track(channelId: string) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch("/api/niche-finder/tracked-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, channelId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to track channel");
    await mutate();
  }

  async function untrack(trackedId: string) {
    const res = await fetch(`/api/niche-finder/tracked-channels/${trackedId}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to untrack");
    await mutate();
  }

  return { tracked: data?.tracked ?? [], loading: isLoading, error, track, untrack, mutate };
}

export interface McpKey {
  id: string;
  label: string | null;
  keyLast4: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function useMcpKeys() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<{ keys: McpKey[] }>("/api/niche-finder/mcp-keys", fetcher);

  async function generate(label?: string): Promise<{ plaintext: string; keyLast4: string }> {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch("/api/niche-finder/mcp-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, label }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to generate key");
    await mutate();
    return json.key;
  }

  async function revoke(keyId: string) {
    const res = await fetch(`/api/niche-finder/mcp-keys/${keyId}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to revoke");
    await mutate();
  }

  return { keys: data?.keys ?? [], loading: isLoading, error, generate, revoke, mutate };
}
