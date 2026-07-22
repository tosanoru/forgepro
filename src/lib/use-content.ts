"use client";

import useSWR from "swr";
import { useWorkspace } from "@/lib/use-workspace";
import type { ContentCard, ContentStage } from "@/lib/content-types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useContentCards() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<{ cards: ContentCard[] }>(
    workspace ? `/api/content?workspaceId=${workspace.id}` : null,
    fetcher,
  );

  async function createCard(input: { name: string; format: "short" | "long"; notes?: string; dueDate?: string }) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, ...input }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to create card");
    await mutate();
    return json.card as ContentCard;
  }

  async function moveStage(cardId: string, toStage: ContentStage) {
    if (!workspace) return;
    // Optimistic update — the board should feel instant on drop, not wait for a round trip.
    await mutate(
      (current) =>
        current && {
          ...current,
          cards: current.cards.map((c) => (c.id === cardId ? { ...c, stage: toStage } : c)),
        },
      { revalidate: false },
    );
    const res = await fetch(`/api/content/${cardId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, toStage }),
    });
    if (!res.ok) await mutate(); // revert to server truth on failure
    else await mutate();
  }

  async function updateCard(cardId: string, patch: Partial<Pick<ContentCard, "name" | "notes" | "dueDate" | "assigneeId">>) {
    if (!workspace) return;
    const res = await fetch(`/api/content/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, ...patch }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to update card");
    await mutate();
    return json.card as ContentCard;
  }

  async function deleteCard(cardId: string) {
    if (!workspace) return;
    const res = await fetch(`/api/content/${cardId}?workspaceId=${workspace.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete card");
    await mutate();
  }

  /**
   * Attaches (or detaches, if cardId is null) a script or video to a
   * content card. Thin wrapper around /api/content/attach — see that
   * route for why scripts/videos are exclusive-per-card while thumbnails
   * (handled separately, see use-thumbnails.ts) are not.
   */
  async function attachResource(field: "scriptId" | "videoId", resourceId: string, cardId: string | null) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch("/api/content/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, field, resourceId, cardId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to update card link");
    await mutate();
  }

  return { cards: data?.cards ?? [], loading: isLoading, error, createCard, moveStage, updateCard, deleteCard, attachResource, mutate };
}
