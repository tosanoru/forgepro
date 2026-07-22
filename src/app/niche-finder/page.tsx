"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useNiches } from "@/lib/use-niche-finder";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Compass, TrendingUp, Swords, Lock, Loader2 } from "lucide-react";

function ScoreBar({ value, tone }: { value: number | null; tone: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

export default function NicheFinderPage() {
  const [category, setCategory] = useState("");
  const [minGrowth, setMinGrowth] = useState("");
  const { niches, limited, loading } = useNiches({
    category: category || undefined,
    minGrowthScore: minGrowth ? Number(minGrowth) : undefined,
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 09 · NICHE FINDER"
        title="Niches"
        subtitle="Growing YouTube niches, ranked by growth score. RPM figures are rough category estimates, not measured data."
        action={
          <div className="flex gap-2">
            <Link href="/niche-finder/tracked">
              <Button variant="outline" size="sm">Tracked channels</Button>
            </Link>
            <Link href="/niche-finder/mcp">
              <Button variant="outline" size="sm">MCP access</Button>
            </Link>
          </div>
        }
      />

      {limited && (
        <div className="mb-5 flex items-center gap-2 border border-dashed border-border p-3 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Free plan: showing the top 20 niches by growth score, filters disabled. Upgrade to Lite for full filtering
          and channel tracking, or Pro for MCP access.
        </div>
      )}

      {!limited && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Input placeholder="Category (e.g. finance)" value={category} onChange={(e) => setCategory(e.target.value)} className="w-48" />
          <Input
            type="number"
            placeholder="Min growth score"
            value={minGrowth}
            onChange={(e) => setMinGrowth(e.target.value)}
            className="w-40"
          />
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading niches…
        </div>
      ) : niches.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <Compass className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No niches yet — the discovery pipeline hasn&rsquo;t run, or hasn&rsquo;t found anything matching these filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {niches.map((n) => (
            <Link key={n.id} href={`/niche-finder/${n.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <CardTitle className="text-base">{n.name}</CardTitle>
                  <CardDescription>
                    {n.estimatedRpmLow && n.estimatedRpmHigh ? `~$${n.estimatedRpmLow}–$${n.estimatedRpmHigh} RPM (est.)` : "RPM unavailable"}
                  </CardDescription>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Growth</span>
                    </div>
                    <ScoreBar value={n.growthScore} tone="bg-emerald-stat" />
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Swords className="h-3 w-3" /> Competition</span>
                    </div>
                    <ScoreBar value={n.competitionScore} tone="bg-rose-stat" />
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
