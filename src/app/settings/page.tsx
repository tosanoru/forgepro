"use client";

import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useWorkspace } from "@/lib/use-workspace";
import { useAiSettings } from "@/lib/use-scripts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KeyRound, ShieldCheck, ExternalLink, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Ported verbatim from Forge's settings/page.tsx PROVIDERS list — this
// metadata (key URLs, placeholders, default models) isn't product-specific.
const PROVIDERS = [
  { value: "anthropic", label: "Anthropic", modelPlaceholder: "claude-sonnet-4-6", keyUrl: "https://console.anthropic.com/settings/keys", keyPlaceholder: "sk-ant-..." },
  { value: "openai", label: "OpenAI", modelPlaceholder: "gpt-4.1-mini", keyUrl: "https://platform.openai.com/api-keys", keyPlaceholder: "sk-..." },
  { value: "deepseek", label: "DeepSeek", modelPlaceholder: "deepseek-chat", keyUrl: "https://platform.deepseek.com/api_keys", keyPlaceholder: "sk-..." },
  { value: "minimax", label: "MiniMax", modelPlaceholder: "MiniMax-Text-01", keyUrl: "https://www.minimax.io/platform/user-center/basic-information/interface-key", keyPlaceholder: "eyJhbGciOi..." },
  { value: "openrouter", label: "OpenRouter", modelPlaceholder: "openai/gpt-4o-mini", keyUrl: "https://openrouter.ai/settings/keys", keyPlaceholder: "sk-or-..." },
  { value: "nvidia", label: "NVIDIA NIM", modelPlaceholder: "meta/llama-3.1-70b-instruct", keyUrl: "https://build.nvidia.com", keyPlaceholder: "nvapi-..." },
  { value: "kimi", label: "Kimi (Moonshot AI)", modelPlaceholder: "moonshot-v1-8k", keyUrl: "https://platform.moonshot.cn/console/api-keys", keyPlaceholder: "sk-..." },
  { value: "glm", label: "GLM (Zhipu AI)", modelPlaceholder: "glm-4-plus", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys", keyPlaceholder: "xxx." },
  { value: "google", label: "Google Gemini", modelPlaceholder: "gemini-2.0-flash", keyUrl: "https://aistudio.google.com/apikey", keyPlaceholder: "AIza..." },
] as const;

export default function SettingsPage() {
  const { role } = useWorkspace();
  const { settings, loading, save } = useAiSettings();
  const [provider, setProvider] = useState<string>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);

  const [prevSettings, setPrevSettings] = useState(settings);
  if (settings && prevSettings !== settings) {
    setPrevSettings(settings);
    setProvider(settings.provider);
    setModel(settings.model);
  }

  const canEdit = role === "owner" || role === "admin";
  const active = PROVIDERS.find((p) => p.value === provider) ?? PROVIDERS[0];

  const submit = async () => {
    setSaving(true);
    try {
      await save({ provider, apiKey: apiKey.trim() || undefined, model: model.trim() });
      setApiKey("");
      toast.success("AI settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await save({ provider, clearKey: true });
      setApiKey("");
      toast.success("Key removed — script generation will fall back to the app default");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 00 · CONFIGURATION"
        title="AI Settings"
        subtitle="Bring your own API key so script generation runs on your account, your usage, your bill."
      />

      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !canEdit ? (
        <div className="max-w-2xl border border-dashed border-border p-5 text-xs text-muted-foreground">
          Only workspace owners and admins can change AI settings.
          {settings?.hasKey && (
            <span className="mt-2 block">
              Currently using <strong>{PROVIDERS.find((p) => p.value === settings.provider)?.label}</strong> with a
              key ending in {settings.keyLast4}.
            </span>
          )}
        </div>
      ) : (
        <Card className="max-w-2xl border-primary/40 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <CardTitle>Bring Your Own Key (BYOK)</CardTitle>
            </div>
            <CardDescription>
              Shared by everyone in this workspace for AI Script Writing. Stored encrypted on the server — not in
              your browser, and there&rsquo;s no way to view it again once saved, only replace or remove it.
              {settings?.hasKey && (
                <span className="mt-1.5 flex items-center gap-1.5 text-emerald-stat">
                  <ShieldCheck className="h-3.5 w-3.5" /> Key saved, ending in {settings.keyLast4}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>AI Platform</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="apiKey">API Key</Label>
                <a
                  href={active.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Get a {active.label} key <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <Input
                id="apiKey"
                type="password"
                autoComplete="off"
                placeholder={settings?.hasKey ? "•••••••••••••••• (leave blank to keep current key)" : active.keyPlaceholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">
                Model <span className="font-normal text-muted-foreground">(optional override)</span>
              </Label>
              <Input id="model" placeholder={active.modelPlaceholder} value={model} onChange={(e) => setModel(e.target.value)} />
            </div>

            <div className="flex gap-2">
              <Button onClick={submit} disabled={saving} className="flex-1">
                {saving ? "Saving…" : "Save settings"}
              </Button>
              {settings?.hasKey && (
                <Button onClick={clear} disabled={saving} variant="outline" size="icon" aria-label="Remove key">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
