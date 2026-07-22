"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useNicheDetail } from "@/lib/use-niche-finder";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Users, AlertTriangle } from "lucide-react";

export default function NicheDetailPage() {
  const params = useParams<{ id: string }>();
  const { niche, channels, loading } = useNicheDetail(params.id);

  if (loading || !niche) {
    return (
      <AppShell>
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading niche…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 09 · NICHE"
        title={niche.name}
        subtitle={`Growth ${niche.growthScore ?? "—"} · Competition ${niche.competitionScore ?? "—"} · Updated ${new Date(niche.updatedAt).toLocaleDateString()}`}
      />

      <div className="mb-6 flex items-start gap-2 border border-dashed border-border p-3 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        RPM (${niche.estimatedRpmLow}–${niche.estimatedRpmHigh}) is a rough category-based estimate, not measured
        ad revenue data. Treat it as a starting point for research, not a forecast.
      </div>

      <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Top channels
      </h2>

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No channels linked to this niche yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((c) => (
            <Link key={c.id} href={`/niche-finder/channels/${c.id}`}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {c.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.thumbnailUrl} alt="" className="h-8 w-8 rounded-full" />
                    )}
                    <CardTitle className="line-clamp-1 text-sm">{c.title}</CardTitle>
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {c.latestSnapshot ? c.latestSnapshot.subscriberCount.toLocaleString() : "—"} subscribers
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
