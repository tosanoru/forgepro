"use client";

import useSWR from "swr";
import { useWorkspace } from "@/lib/use-workspace";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface Video {
  id: string;
  workspaceId: string;
  title: string;
  muxUploadId: string | null;
  muxAssetId: string | null;
  muxPlaybackId: string | null;
  durationSeconds: number | null;
  status: "uploading" | "processing" | "ready" | "errored";
  reviewStatus: "pending_review" | "changes_requested" | "approved";
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VideoComment {
  id: string;
  videoId: string;
  timestampSeconds: number;
  content: string;
  authorId: string | null;
  guestName: string | null;
  resolved: boolean;
  createdAt: string;
}

export function useVideos() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<{ videos: Video[] }>(
    workspace ? `/api/workspace/${workspace.id}/videos` : null,
    fetcher,
    { refreshInterval: 5000 }, // poll while Mux transcodes — no websocket for this yet
  );

  /** Creates the video row + Mux upload, then PUTs the file directly to Mux. */
  async function upload(file: File, title: string, onProgress?: (pct: number) => void): Promise<Video> {
    if (!workspace) throw new Error("No workspace loaded yet");

    const createRes = await fetch(`/api/workspace/${workspace.id}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, corsOrigin: window.location.origin }),
    });
    const created = await createRes.json();
    if (!createRes.ok) throw new Error(created.error ?? "Failed to start upload");

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`))));
      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.open("PUT", created.uploadUrl);
      xhr.send(file);
    });

    await mutate();
    return created.video;
  }

  return { videos: data?.videos ?? [], loading: isLoading, error, upload, mutate };
}

export function useVideo(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ video: Video }>(id ? `/api/videos/${id}` : null, fetcher, {
    refreshInterval: (data) => (data?.video && data.video.status !== "ready" && data.video.status !== "errored" ? 3000 : 0),
  });
  return { video: data?.video ?? null, loading: isLoading, error, mutate };
}

export function useVideoComments(videoId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ comments: VideoComment[] }>(
    videoId ? `/api/videos/${videoId}/comments` : null,
    fetcher,
  );

  async function addComment(timestampSeconds: number, content: string) {
    if (!videoId) return;
    const res = await fetch(`/api/videos/${videoId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestampSeconds, content }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to add comment");
    await mutate();
    return json.comment as VideoComment;
  }

  async function toggleResolved(commentId: string, resolved: boolean) {
    if (!videoId) return;
    const res = await fetch(`/api/videos/${videoId}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to update comment");
    await mutate();
  }

  return { comments: data?.comments ?? [], loading: isLoading, error, addComment, toggleResolved, mutate };
}

export interface ApprovalLink {
  id: string;
  token: string;
  label: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

export function useApprovalLinks(videoId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ links: ApprovalLink[] }>(
    videoId ? `/api/videos/${videoId}/approval-link` : null,
    fetcher,
  );

  async function createLink(label?: string, expiresInDays?: number) {
    if (!videoId) return;
    const res = await fetch(`/api/videos/${videoId}/approval-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, expiresInDays }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to create review link");
    await mutate();
    return json.link as ApprovalLink;
  }

  async function setRevoked(linkId: string, revoked: boolean) {
    if (!videoId) return;
    const res = await fetch(`/api/videos/${videoId}/approval-link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId, revoked }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to update review link");
    await mutate();
    return json.link as ApprovalLink;
  }

  return { links: data?.links ?? [], loading: isLoading, error, createLink, setRevoked, mutate };
}
