"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useScripts } from "@/lib/use-scripts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SHORT_FORM_STYLES, LONG_FORM_STYLES } from "@/lib/viral-styles";
import type { ViralStyle } from "@/lib/viral-styles";
import { parseSections } from "@/lib/script-sections";

type Step = "format" | "style" | "brief";

const FORMAT_COPY: Record<"short" | "long", { label: string; description: string; placeholder: string }> = {
  long: {
    label: "Long-form",
    description: "Full hook / intro / body (with a mid-script retention beat) / mid-roll CTA / closing CTA.",
    placeholder: "e.g. Why most new YouTubers quit in the first 90 days, and the 3 mistakes that actually cause it — for beginner creators under 1k subs.",
  },
  short: {
    label: "Short-form",
    description: "Single hook-to-payoff loop under 60 seconds — TikTok / Reels / Shorts, no scene breaks, no generic CTA.",
    placeholder: "e.g. The one editing mistake that makes your videos look amateur (and takes 10 seconds to fix).",
  },
};

function ViralStyleCard({ style, selected, onSelect }: { style: ViralStyle; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-4 text-left transition-all ${
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50 hover:bg-muted/30"
      }`}
    >
      <div className="font-medium text-sm">{style.label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{style.description}</div>
    </button>
  );
}

function NewScriptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { generate } = useScripts();

  const cardId = searchParams.get("cardId") ?? undefined;
  const initialFormat = searchParams.get("format") === "short" ? "short" : "long";

  const [step, setStep] = useState<Step>(cardId ? "brief" : "format");
  const [format, setFormat] = useState<"short" | "long">(initialFormat);
  const [scriptStyle, setScriptStyle] = useState<string | null>(null);
  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");
  const [generating, setGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");

  const styles = format === "short" ? SHORT_FORM_STYLES : LONG_FORM_STYLES;
  const streamedSections = parseSections(streamedContent, format);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setGenerating(true);
    setStreamedContent("");
    try {
      const script = await generate(topic.trim(), {
        format,
        scriptStyle: scriptStyle ?? undefined,
        contentCardId: cardId,
        onDelta: (delta) => setStreamedContent((prev) => prev + delta),
      });
      toast.success(cardId ? "Script generated and attached to the card" : "Script generated");
      router.push(`/ai-script/${script.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setGenerating(false);
    }
  };

  const copy = FORMAT_COPY[format];

  if (step === "format") {
    return (
      <div className="space-y-4 max-w-2xl">
        <h3 className="font-medium text-sm text-muted-foreground">Choose your format</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { setFormat("long"); setStep("style"); }}
            className="rounded-lg border border-border p-5 text-left transition-all hover:border-primary/50 hover:bg-muted/30"
          >
            <div className="text-base font-medium">Long-form</div>
            <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              YouTube deep-dives, 8&ndash;20 minutes. Retention hooks, mid-roll CTA.
            </div>
          </button>
          <button
            type="button"
            onClick={() => { setFormat("short"); setStep("style"); }}
            className="rounded-lg border border-border p-5 text-left transition-all hover:border-primary/50 hover:bg-muted/30"
          >
            <div className="text-base font-medium">Short-form</div>
            <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              TikTok / Reels / Shorts, under 60s. Single hook-to-payoff loop.
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (step === "style") {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setStep("format")} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="font-medium text-sm text-muted-foreground">Pick a viral script style</h3>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {styles.map((s) => (
            <ViralStyleCard
              key={s.id}
              style={s}
              selected={scriptStyle === s.id}
              onSelect={() => { setScriptStyle(s.id); setStep("brief"); }}
            />
          ))}
        </div>
        {scriptStyle && (
          <Button variant="ghost" size="sm" onClick={() => setStep("brief")} className="w-full">
            Skip — picked already
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep("style")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle>Topic / brief</CardTitle>
        </div>
        <CardDescription>
          {copy.description} You&rsquo;ll be able to edit everything after.
          {cardId && " Generating for a content card."}
          {scriptStyle && (
            <span className="block mt-1">
              Style: <span className="font-medium">{styles.find((s) => s.id === scriptStyle)?.label}</span>
              &ensp;
              <button
                type="button"
                onClick={() => setScriptStyle(null)}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Change
              </button>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="topic">What&rsquo;s the video about?</Label>
            <Textarea id="topic" required rows={5} placeholder={copy.placeholder} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <Button type="submit" disabled={generating} className="w-full">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate script
              </>
            )}
          </Button>
        </form>
        {generating && streamedContent && (
          <div className="mt-4 space-y-3">
            {streamedSections.map((s, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-1.5 inline-block rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {s.label}
                </div>
                <div className="whitespace-pre-wrap text-sm leading-[1.8] text-foreground/90">
                  {s.content}
                  {i === streamedSections.length - 1 && <span className="animate-pulse text-primary">▍</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function NewScriptPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="№ 03 · NEW AI SCRIPT" title="Generate a script" subtitle="Pick a format, then a viral script style, then give it a topic." />
      <Suspense fallback={<div className="h-64" />}>
        <NewScriptForm />
      </Suspense>
    </AppShell>
  );
}
