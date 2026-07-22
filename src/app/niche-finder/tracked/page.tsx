"use client";

import Link from "next/link";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useTrackedChannels } from "@/lib/use-niche-finder";
import { Button } from "@/components/ui/button";
import { Loader2, Bookmark, X } from "lucide-react";
import { toast } from "sonner";

export default function TrackedChannelsPage() {
  const { tracked, loading, untrack } = useTrackedChannels();

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 09 · TRACKED"
        title="Tracked channels"
        subtitle="Shared with your whole workspace — anyone on the team sees the same list."
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : tracked.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <Bookmark className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No channels tracked yet — find one on the{" "}
            <Link href="/niche-finder" className="text-primary hover:underline">
              Niches
            </Link>{" "}
            page and hit Track.
          </p>
        </div>
      ) : (
        <div className="border border-border bg-card">
          <ul className="divide-y divide-border">
            {tracked.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link href={`/niche-finder/channels/${t.channel.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                  {t.channel.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.channel.thumbnailUrl} alt="" className="h-8 w-8 shrink-0 rounded-full" />
                  )}
                  <span className="truncate text-sm font-medium">{t.channel.title}</span>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await untrack(t.id);
                    toast.success("Untracked");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
