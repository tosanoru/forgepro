"use client";

import useSWR from "swr";
import { useWorkspace } from "@/lib/use-workspace";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface Script {
  id: string;
  workspaceId: string;
  title: string;
  topic: string;
  format: "short" | "long";
  scriptStyle: string | null;
  content: string;
  status: "draft" | "in_review" | "approved";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function useScripts() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<{ scripts: Script[] }>(
    workspace ? `/api/scripts?workspaceId=${workspace.id}` : null,
    fetcher,
  );

  async function generate(
    topic: string,
    options?: { title?: string; format?: "short" | "long"; scriptStyle?: string; contentCardId?: string; onDelta?: (delta: string) => void },
  ): Promise<Script> {
    if (!workspace) throw new Error("No workspace loaded yet");
    const { onDelta, ...body } = options ?? {};
    const res = await fetch("/api/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id, topic, ...body }),
    });

    if (!res.ok) {
      // A non-2xx here means the request never reached the streaming
      // branch at all (auth/plan-limit checks run before the
      // ReadableStream starts) — safe to read as plain JSON.
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to generate script");
    }
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalScript: Script | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? ""; // last chunk may be a partial event — carry it over

      for (const event of events) {
        const line = event.trim();
        if (!line.startsWith("data:")) continue;
        const parsed = JSON.parse(line.slice(5).trim()) as { delta?: string; done?: boolean; script?: Script; error?: string };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.delta) onDelta?.(parsed.delta);
        if (parsed.done && parsed.script) finalScript = parsed.script;
      }
    }

    if (!finalScript) throw new Error("Stream ended without a completed script");
    await mutate();
    return finalScript;
  }

  return { scripts: data?.scripts ?? [], loading: isLoading, error, generate, mutate };
}

export interface ScriptVersion {
  id: string;
  scriptId: string;
  content: string;
  editedBy: string;
  createdAt: string;
}

export function useScriptVersions(scriptId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ versions: ScriptVersion[] }>(
    scriptId ? `/api/scripts/${scriptId}/versions` : null,
    fetcher,
  );

  async function restore(versionId: string): Promise<Script> {
    if (!scriptId) throw new Error("No script loaded");
    const res = await fetch(`/api/scripts/${scriptId}/versions/${versionId}/restore`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to restore version");
    await mutate();
    return json.script;
  }

  return { versions: data?.versions ?? [], loading: isLoading, error, restore, mutate };
}

export function useScript(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ script: Script }>(id ? `/api/scripts/${id}` : null, fetcher);

  async function update(patch: Partial<Pick<Script, "title" | "content" | "status">>) {
    if (!id) return;
    const res = await fetch(`/api/scripts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to save");
    await mutate();
    return json.script as Script;
  }

  return { script: data?.script ?? null, loading: isLoading, error, update, mutate };
}

interface AiSettings {
  provider: string;
  model: string;
  hasKey: boolean;
  keyLast4: string | null;
}

export function useAiSettings() {
  const { workspace } = useWorkspace();
  const { data, error, isLoading, mutate } = useSWR<AiSettings>(
    workspace ? `/api/workspace/${workspace.id}/ai-settings` : null,
    fetcher,
  );

  async function save(params: { provider: string; apiKey?: string; model?: string; clearKey?: boolean }) {
    if (!workspace) throw new Error("No workspace loaded yet");
    const res = await fetch(`/api/workspace/${workspace.id}/ai-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to save AI settings");
    await mutate();
    return json;
  }

  return { settings: data, loading: isLoading, error, save };
}
