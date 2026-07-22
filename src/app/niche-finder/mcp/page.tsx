"use client";

import { useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useMcpKeys } from "@/lib/use-niche-finder";
import { useWorkspace } from "@/lib/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Copy, Check, Trash2, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const CONFIG_SNIPPET = (key: string) => `{
  "mcpServers": {
    "forge2-niche-finder": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://your-forge2-domain.com/api/mcp/niche-finder"],
      "env": {
        "MCP_REMOTE_AUTH_TOKEN": "${key}"
      }
    }
  }
}`;

export default function McpAccessPage() {
  const { role } = useWorkspace();
  const { keys, loading, generate, revoke } = useMcpKeys();
  const [label, setLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canManage = role === "owner" || role === "admin";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const result = await generate(label.trim() || undefined);
      setNewKey(result.plaintext);
      setLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate — MCP access requires a Pro plan.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 09 · MCP ACCESS"
        title="Claude Desktop / Cursor access"
        subtitle="Query Niche Finder directly from your AI tools — no browser required. Pro plan only."
      />

      {newKey && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <CardTitle>Copy this key now — it won&rsquo;t be shown again</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded border border-border bg-card px-3 py-2 font-mono text-xs">
                {newKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  setCopied(true);
                  toast.success("Copied");
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Claude Desktop / Cursor config</Label>
              <pre className="overflow-x-auto rounded border border-border bg-card p-3 text-[11px] leading-relaxed">
                {CONFIG_SNIPPET(newKey)}
              </pre>
              <p className="text-xs text-muted-foreground">
                Replace <code>your-forge2-domain.com</code> with your actual deployment URL, save as{" "}
                <code>claude_desktop_config.json</code> (or your client&rsquo;s MCP config file), and restart the client.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card className="mb-6 max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <CardTitle>Generate a new key</CardTitle>
            </div>
            <CardDescription>Each key is personal to you — not shared with your team, unlike tracked channels.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex gap-2">
              <Input placeholder="Label (e.g. Claude Desktop)" value={label} onChange={(e) => setLabel(e.target.value)} />
              <Button type="submit" disabled={generating}>
                {generating ? "Generating…" : "Generate"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex h-24 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
        </div>
      ) : keys.length > 0 ? (
        <div className="max-w-md border border-border bg-card">
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{k.label || "Unlabeled key"}</div>
                  <div className="text-xs text-muted-foreground">
                    ••{k.keyLast4} · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await revoke(k.id);
                    toast.success("Revoked");
                  }}
                  className="text-muted-foreground hover:text-rose-stat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No keys yet.</p>
      )}
    </AppShell>
  );
}
