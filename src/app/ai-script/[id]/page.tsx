"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useScript, useScriptVersions } from "@/lib/use-scripts";
import { useContentCards } from "@/lib/use-content";
import { AttachCardPicker } from "@/components/AttachCardPicker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Save, History, RotateCcw, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SHORT_FORM_STYLES, LONG_FORM_STYLES } from "@/lib/viral-styles";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
];

export default function ScriptDetailPage() {
  const params = useParams<{ id: string }>();
  const { script, loading, update, mutate } = useScript(params.id);
  const { cards, attachResource } = useContentCards();
  const { versions, restore } = useScriptVersions(params.id);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedScriptId, setLoadedScriptId] = useState<string | null>(null);

  if (script && loadedScriptId !== script.id) {
    setLoadedScriptId(script.id);
    setContent(script.content);
  }
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    try {
      await update({ content });
      setDirty(false);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    setRestoringId(versionId);
    try {
      const restored = await restore(versionId);
      setContent(restored.content);
      setDirty(false);
      await mutate();
      toast.success("Restored — the previous version was saved to history too");
      setHistoryOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setRestoringId(null);
    }
  };

  if (loading || !script) {
    return (
      <AppShell>
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading script…
        </div>
      </AppShell>
    );
  }

  const styles = script.format === "short" ? SHORT_FORM_STYLES : LONG_FORM_STYLES;

  // scriptId lives on content_card, not on the script itself — this is the
  // reverse lookup, since a script doesn't know which card claims it.
  const attachedCardId = cards.find((c) => c.scriptId === script.id)?.id ?? null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 03 · AI SCRIPT"
        title={script.title}
        subtitle={`${script.format === "short" ? "Short-form" : "Long-form"}${script.scriptStyle ? ` · ${styles.find((s) => s.id === script.scriptStyle)?.label ?? script.scriptStyle}` : ""} · ${script.topic}`}
        action={
          <div className="flex items-center gap-2">
            {versions.length > 0 && (
              <Button variant="outline" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" /> History ({versions.length})
              </Button>
            )}
            <Select value={script.status} onValueChange={(v) => update({ status: v as typeof script.status })}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />

      <div className="mb-4 max-w-xs">
        <AttachCardPicker
          currentCardId={attachedCardId}
          onAttach={async (cardId) => {
            try {
              await attachResource("scriptId", script.id, cardId);
              toast.success(cardId ? "Attached to content card" : "Detached from content card");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to update");
            }
          }}
        />
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Button
          variant={preview ? "default" : "outline"}
          size="sm"
          onClick={() => setPreview(true)}
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </Button>
        <Button
          variant={preview ? "outline" : "default"}
          size="sm"
          onClick={() => setPreview(false)}
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
        {dirty && <span className="text-[11px] text-amber-500">Unsaved changes</span>}
      </div>

      {preview ? (
        <div className="prose prose-sm prose-invert max-w-none rounded-lg border border-border bg-muted/20 p-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content.replace(/^\[([^\]]+)\]\s*/gm, "### $1\n")}
          </ReactMarkdown>
        </div>
      ) : (
        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          rows={28}
          className="text-sm leading-[1.8]"
        />
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Every edit saves what the script said right before it changed. Restoring never loses the current
              version either — it gets saved as a new entry first.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {versions.map((v) => (
              <div key={v.id} className="border-b border-border pb-3 last:border-0">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(v.createdAt).toLocaleString()}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => handleRestore(v.id)} disabled={restoringId === v.id}>
                    {restoringId === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Restore
                  </Button>
                </div>
                <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{v.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
