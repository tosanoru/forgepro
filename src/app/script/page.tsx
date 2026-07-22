"use client";

import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useScripts } from "@/lib/use-scripts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, FileText, Loader2 } from "lucide-react";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", in_review: "In review", approved: "Approved" };

export default function ScriptListPage() {
  const { scripts, loading } = useScripts();

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 03 · SCRIPTS"
        title="AI Script Writing"
        subtitle="Generate a draft from a topic, then edit it into something you'd actually record."
        action={
          <Link href="/script/new">
            <Button>
              <Sparkles className="h-4 w-4" /> New script
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading scripts…
        </div>
      ) : scripts.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No scripts yet. Generate your first one from a topic.</p>
          <Link href="/script/new" className="mt-4 inline-block">
            <Button size="sm">
              <Sparkles className="h-4 w-4" /> New script
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scripts.map((s) => (
            <Link key={s.id} href={`/script/${s.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="line-clamp-2 text-base">{s.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{s.topic}</CardDescription>
                  <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    <span className={`rounded-full px-1.5 py-0.5 ${s.format === "short" ? "bg-indigo-stat/15 text-indigo-stat" : "bg-muted"}`}>
                      {s.format}
                    </span>
                    {STATUS_LABEL[s.status]} · {new Date(s.updatedAt).toLocaleDateString()}
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
