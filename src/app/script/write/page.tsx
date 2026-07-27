"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useScripts } from "@/lib/use-scripts";
import { getTemplates, getTemplate, buildTemplateContent, type Template } from "@/lib/script-templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Clock, ArrowLeft, PenLine, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";

type Step = "format" | "choose" | "scratch" | "template";

export default function WriteScriptPage() {
  const router = useRouter();
  const { create } = useScripts();
  const [step, setStep] = useState<Step>("format");
  const [format, setFormat] = useState<"short" | "long">("long");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const templates = useMemo(() => getTemplates(format), [format]);
  const selectedTemplate = useMemo(
    () => (selectedTemplateId ? getTemplate(format, selectedTemplateId) ?? null : null),
    [format, selectedTemplateId],
  );

  function pickTemplate(t: Template) {
    setSelectedTemplateId(t.id);
    setContent(buildTemplateContent(t));
    setStep("template");
  }

  function goToScratch() {
    setSelectedTemplateId(null);
    setContent("");
    setStep("scratch");
  }

  function formatLength(t: Template): string {
    const { min, max, unit } = t.estimatedLength;
    if (unit === "seconds") {
      if (max <= 60) return `${min}–${max}s`;
      if (max <= 90) return `${min}–90s`;
      return `${Math.round(min / 60)}–${Math.round(max / 60)}min`;
    }
    return `${min}–${max}${unit}`;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const script = await create({ title: title.trim(), topic: topic.trim() || undefined, format, content });
      toast.success("Script created");
      router.push(`/ai-script/${script.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create script");
    } finally {
      setSaving(false);
    }
  };

  const formatLabel = format === "long" ? "long-form" : "short-form";

  return (
    <AppShell>
      <PageHeader
        eyebrow="СЦЕНАРИЙ · WRITE SCRIPT"
        title="Write a script"
        subtitle="Write a script from scratch — no AI generation."
      />

      <div>
        {/* Step 1: Pick format */}
        {step === "format" && (
          <div className="max-w-2xl space-y-6">
            <p className="text-sm text-muted-foreground">What kind of script are you writing?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => { setFormat("long"); setStep("choose"); }}
                className="group flex flex-col gap-3 rounded-xl border border-border p-6 text-left transition-all hover:border-primary/50 hover:bg-primary/[0.02]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Long-form</div>
                  <div className="mt-1 text-sm text-muted-foreground">YouTube deep-dives, tutorials, essays — 8–20+ minutes</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setFormat("short"); setStep("choose"); }}
                className="group flex flex-col gap-3 rounded-xl border border-border p-6 text-left transition-all hover:border-primary/50 hover:bg-primary/[0.02]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Short-form</div>
                  <div className="mt-1 text-sm text-muted-foreground">TikTok, Reels, Shorts — 15–90 seconds</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Pick template or write from scratch */}
        {step === "choose" && (
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => { setStep("format"); setContent(""); }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to format selection
            </button>

            <div>
              <Badge variant="outline" className="mb-2 font-mono text-[10px] tracking-wider uppercase">
                {formatLabel}
              </Badge>
              <h2 className="text-lg font-semibold">How would you like to start?</h2>
            </div>

            <div className="space-y-1.5">
              <Label>Start with a template</Label>
              <div className="grid grid-cols-2 gap-3">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTemplate(t)}
                    className="group flex flex-col gap-2 rounded-lg border border-border px-4 py-3 text-left text-sm transition-all hover:border-primary/50 hover:bg-primary/[0.02]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground transition-colors">
                        <LayoutTemplate className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-medium text-foreground truncate">{t.name}</span>
                      <Badge variant="outline" className="ml-auto shrink-0 font-mono text-[10px] tracking-wider">{t.shortCode}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatLength(t)}</span>
                      <span>{t.sections.length} section{t.sections.length !== 1 ? "s" : ""}</span>
                      <div className="ml-auto flex flex-wrap gap-1 justify-end">
                        {t.sections.map((s) => (
                          <span key={s.key} className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
            </div>

            <Button variant="outline" className="w-full" onClick={goToScratch}>
              <PenLine className="h-4 w-4" /> Write from scratch
            </Button>
          </div>
        )}

        {/* Step 3a: Form with template */}
        {step === "template" && selectedTemplate && (
          <form onSubmit={submit} className="max-w-2xl space-y-5">
            <button
              type="button"
              onClick={() => { setStep("choose"); setSelectedTemplateId(null); setContent(""); }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back to template selection
            </button>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{selectedTemplate.name}</h2>
                  <Badge variant="outline" className="font-mono text-[10px] tracking-wider">{selectedTemplate.shortCode}</Badge>
                  <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase">{formatLabel}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{selectedTemplate.description}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {selectedTemplate.sections.map((s, i) => (
                <span key={s.key} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  {i + 1}. {s.label}
                </span>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" required placeholder="e.g. Why most new YouTubers quit" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topic">Topic (optional)</Label>
              <Input id="topic" placeholder="e.g. Beginner creators under 1k subs" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content">Script content</Label>
              <Textarea id="content" rows={20} placeholder="Write your script here…" value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <><FileText className="h-4 w-4" /> Write script</>
              )}
            </Button>
          </form>
        )}

        {/* Step 3b: Form from scratch */}
        {step === "scratch" && (
          <Card className="max-w-2xl">
            <CardContent className="pt-6">
              <button
                type="button"
                onClick={() => { setStep("choose"); }}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>

              <form onSubmit={submit} className="space-y-5">
                <div>
                  <Badge variant="outline" className="mb-2 font-mono text-[10px] tracking-wider uppercase">
                    {formatLabel} · from scratch
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" required placeholder="e.g. Why most new YouTubers quit" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="topic">Topic (optional)</Label>
                  <Input id="topic" placeholder="e.g. Beginner creators under 1k subs" value={topic} onChange={(e) => setTopic(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="content">Script content</Label>
                  <Textarea id="content" rows={16} placeholder="Write your script here…" value={content} onChange={(e) => setContent(e.target.value)} />
                </div>
                <Button type="submit" disabled={saving} className="w-full">
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  ) : (
                    <><FileText className="h-4 w-4" /> Write script</>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
