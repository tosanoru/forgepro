"use client";

import useSWR from "swr";
import type { WorkspaceMember, WorkspaceRole, WorkspaceSummary } from "@/lib/workspace-types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WorkspaceResponse {
  workspace: WorkspaceSummary | null;
  members: WorkspaceMember[];
  role: WorkspaceRole | null;
  allWorkspaces: WorkspaceSummary[];
  children: WorkspaceSummary[];
}

/**
 * Ported from Forge's useWorkspace() (src/lib/use-workspace.ts) — same SWR
 * cache-key pattern, extended response shape (allWorkspaces for a
 * workspace switcher, children for an agency's client list).
 */
export function useWorkspace() {
  const { data, error, isLoading, mutate } = useSWR<WorkspaceResponse>("/api/workspace", fetcher);

  async function invite(email: string, role: WorkspaceRole): Promise<{ status: "added" | "invited" }> {
    if (!data?.workspace) throw new Error("No workspace loaded yet");
    const res = await fetch("/api/workspace/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: data.workspace.id, email, role }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to invite");
    await mutate();
    return json;
  }

  async function createClientWorkspace(name: string) {
    if (!data?.workspace) return;
    const res = await fetch(`/api/workspace/${data.workspace.id}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create client workspace");
    await mutate();
  }

  /**
   * The piece that was missing before: POSTs the switch to the server
   * (which sets ACTIVE_WORKSPACE_COOKIE after verifying membership), then
   * revalidates this hook's own SWR key. Because every other page's data
   * hooks (useContentCards, useVideos, useScripts, useBrandAssets,
   * useRevenue, useThumbnails) all derive their own SWR key from
   * `workspace.id` returned here, revalidating this one hook is enough to
   * cascade a refetch through the whole app — no need to individually
   * invalidate every other module's cache.
   */
  async function switchWorkspace(workspaceId: string) {
    const res = await fetch("/api/workspace/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to switch workspace");
    await mutate();
  }

  return {
    workspace: data?.workspace ?? null,
    members: data?.members ?? [],
    role: data?.role ?? null,
    allWorkspaces: data?.allWorkspaces ?? [],
    children: data?.children ?? [],
    loading: isLoading,
    error,
    invite,
    createClientWorkspace,
    switchWorkspace,
    mutate,
  };
}
