"use client";

import useSWR from "swr";
import { useWorkspace } from "@/lib/use-workspace";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface BrandAsset {
  id: string;
  workspaceId: string;
  name: string;
  folder: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

export function useBrandAssets() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<{ assets: BrandAsset[] }>(
    workspace ? `/api/workspace/${workspace.id}/assets` : null,
    fetcher,
  );

  async function upload(file: File, folder: string, onProgress?: (pct: number) => void): Promise<BrandAsset> {
    if (!workspace) throw new Error("No workspace loaded yet");

    const createRes = await fetch(`/api/workspace/${workspace.id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, folder, mimeType: file.type || "application/octet-stream", sizeBytes: file.size }),
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
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.send(file);
    });

    await mutate();
    return created.asset;
  }

  async function download(assetId: string) {
    const res = await fetch(`/api/assets/${assetId}/download`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to get download link");
    window.open(json.url, "_blank");
  }

  async function remove(assetId: string) {
    const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json()).error ?? "Failed to delete");
    await mutate();
  }

  return { assets: data?.assets ?? [], loading: isLoading, error, upload, download, remove, mutate };
}
