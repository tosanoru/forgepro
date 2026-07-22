"use client";

import { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useThumbnails, useImageSettings } from "@/lib/use-thumbnails";
import { AttachCardPicker } from "@/components/AttachCardPicker";
import { useWorkspace } from "@/lib/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Image as ImageIcon, Sparkles, KeyRound, Trash2, Download, Loader2, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Script {
  id: string;
  title: string;
  format: "short" | "long";
  updatedAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  google: "Google (Gemini)",
  nvidia: "Nvidia NIM",
};

const PROVIDER_LINKS: Record<string, { href: string; label: string }> = {
  openai: { href: "https://platform.openai.com/api-keys", label: "Get an OpenAI key" },
  google: { href: "https://aistudio.google.com/apikey", label: "Get a Gemini API key" },
  nvidia: { href: "https://build.nvidia.com/explore/image", label: "Get an Nvidia NIM key" },
};

const PROVIDER_PLACEHOLDER: Record<string, string> = {
  openai: "sk-...",
  google: "AIza...",
  nvidia: "nvapi-...",
};

export default function ThumbnailsPage() {
  const { workspace, role } = useWorkspace();
  const { thumbnails, loading, generate, remove, setContentCard } = useThumbnails();
  const { status, connect, disconnect, setBudget } = useImageSettings();

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("openai");
  const [connecting, setConnecting] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: scriptsData } = useSWR<{ scripts: Script[] }>(
    workspace ? `/api/scripts?workspaceId=${workspace.id}` : null,
    fetcher,
  );

  const canManage = role === "owner" || role === "admin";

  const submitGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    if (!status?.connected) {
      setSettingsOpen(true);
      return;
    }
    setGenerating(true);
    try {
      await generate(prompt.trim());
      toast.success("Thumbnail generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const submitConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    try {
      await connect(apiKey.trim(), provider);
      setApiKey("");
      toast.success(`${PROVIDER_LABELS[provider]} connected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  };

  const analyzeSelectedScript = async () => {
    if (!workspace || !selectedScriptId) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/thumbnails/analyze-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, scriptId: selectedScriptId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to analyze script");
      setPrompt(json.prompt);
      textareaRef.current?.focus();
      toast.success("Optimized prompt generated from script");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to analyze");
    } finally {
      setAnalyzing(false);
    }
  };

  const selectedScript = scriptsData?.scripts?.find((s) => s.id === selectedScriptId);

  const connectedLabel = status?.connected
    ? `${PROVIDER_LABELS[status.provider] ?? status.provider} ••${status.keyLast4}`
    : "Connect a key";

  const connectTitle = status?.connected
    ? `${PROVIDER_LABELS[status.provider] ?? status.provider} image generation`
    : "Connect an image provider";

  const connectDescription = status?.connected
    ? "Manage your connected image generation provider and monthly budget."
    : "Generate thumbnails with OpenAI gpt-image-1, Google Gemini, or Nvidia NIM. This is separate from whatever provider powers AI Script Writing.";

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 08 · THUMBNAILS"
        title="Thumbnail Generation"
        subtitle="Describe the shot — face, expression, text overlay, mood — and generate options."
        action={
          canManage && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <KeyRound className="h-4 w-4" /> {connectedLabel}
            </Button>
          )
        }
      />

      <Card className="mb-6">
        <CardContent className="pt-6 space-y-4">
          <form onSubmit={submitGenerate} className="flex flex-col gap-3 sm:flex-row">
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Shocked face close-up, red arrow pointing at a laptop screen, bold yellow text space top-left, high contrast, YouTube thumbnail style"
              rows={2}
              className="flex-1"
            />
            <Button type="submit" disabled={generating || !prompt.trim()} className="sm:self-end">
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Generate
                </>
              )}
            </Button>
          </form>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Select value={selectedScriptId} onValueChange={setSelectedScriptId}>
                <SelectTrigger>
                  <SelectValue placeholder="Or pick a script to analyze…" />
                </SelectTrigger>
                <SelectContent>
                  {scriptsData?.scripts?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!selectedScriptId || analyzing}
              onClick={analyzeSelectedScript}
            >
              {analyzing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
              ) : (
                <><FileText className="h-4 w-4" /> Analyze Script</>
              )}
            </Button>
          </div>

          {!status?.connected && (
            <p className="text-xs text-muted-foreground">
              No image provider connected yet — you&rsquo;ll be prompted to add one when you generate.
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading thumbnails…
        </div>
      ) : thumbnails.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No thumbnails generated yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {thumbnails.map((t) => (
            <Card key={t.id} className="group overflow-hidden">
              <div className="aspect-video overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.url} alt={t.prompt} className="h-full w-full object-cover" />
              </div>
              <CardHeader>
                <CardDescription className="line-clamp-2 text-xs">{t.prompt}</CardDescription>
              </CardHeader>
              <div className="px-6 pb-2">
                <AttachCardPicker
                  currentCardId={t.contentCardId}
                  onAttach={async (cardId) => {
                    try {
                      await setContentCard(t.id, cardId);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to update");
                    }
                  }}
                />
              </div>
              <div className="flex gap-1 border-t border-border p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <a href={t.url} target="_blank" rel="noreferrer" className="flex-1">
                  <Button size="sm" variant="ghost" className="w-full">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 text-rose-stat hover:text-rose-stat"
                  onClick={async () => {
                    await remove(t.id);
                    toast.success("Deleted");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Provider connect dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{connectTitle}</DialogTitle>
            <DialogDescription>{connectDescription}</DialogDescription>
          </DialogHeader>
          {status?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded border border-emerald-stat/30 bg-emerald-stat/5 p-3 text-sm text-emerald-stat">
                <CheckCircle2 className="h-4 w-4" /> {PROVIDER_LABELS[status.provider] ?? status.provider} — key ending in {status.keyLast4}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monthly-budget">Monthly spend cap (optional)</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input
                      id="monthly-budget"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No cap set"
                      className="pl-6"
                      defaultValue={status.monthlyBudgetCents != null ? (status.monthlyBudgetCents / 100).toFixed(2) : ""}
                      onBlur={async (e) => {
                        const raw = e.target.value.trim();
                        try {
                          if (!raw) {
                            await setBudget(null);
                          } else {
                            const cents = Math.round(parseFloat(raw) * 100);
                            if (Number.isNaN(cents) || cents < 0) return;
                            await setBudget(cents);
                          }
                          toast.success("Budget updated");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed to update budget");
                        }
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Generation is blocked once estimated spend this month would exceed this. Cost per image is an
                  estimate (~$0.08), not the exact provider bill. Leave blank for no cap — the plan&rsquo;s monthly
                  generation count limit still applies either way.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full text-rose-stat hover:text-rose-stat"
                onClick={async () => {
                  await disconnect();
                  toast.success("Disconnected");
                }}
              >
                Disconnect
              </Button>
            </div>
          ) : canManage ? (
            <form onSubmit={submitConnect} className="space-y-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Tabs value={provider} onValueChange={setProvider} className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="openai">OpenAI</TabsTrigger>
                    <TabsTrigger value="google">Gemini</TabsTrigger>
                    <TabsTrigger value="nvidia">Nvidia NIM</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="api-key">API key</Label>
                  <a
                    href={PROVIDER_LINKS[provider]?.href ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {PROVIDER_LINKS[provider]?.label ?? "Get a key"} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <Input
                  id="api-key"
                  type="password"
                  required
                  autoComplete="off"
                  placeholder={PROVIDER_PLACEHOLDER[provider] ?? "sk-..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={connecting} className="w-full">
                {connecting ? "Connecting…" : "Connect"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Only workspace owners and admins can connect a provider.</p>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
