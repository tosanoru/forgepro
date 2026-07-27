"use client";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useWorkspace } from "@/lib/use-workspace";
import { useScripts } from "@/lib/use-scripts";
import { useVideos } from "@/lib/use-videos";
import { useContentCards } from "@/lib/use-content";
import { useBrandAssets } from "@/lib/use-assets";
import { useRevenue } from "@/lib/use-revenue";
import { useThumbnails } from "@/lib/use-thumbnails";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Users, Building2, Sparkles, Video, LayoutGrid, FolderOpen, DollarSign, Image, RefreshCw, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CONTENT_STAGES, CONTENT_STAGE_LABELS, daysUntil } from "@/lib/content-types";
import { STAGE_META } from "@/lib/content-meta";

/**
 * Dashboard. All eight modules from the original brief are live: Content
 * Planning, Video Review + Client Approval, AI Script Writing, Thumbnail
 * Generation, Brand Assets, Revenue, Team, and workspace/auth underneath
 * all of it.
 */
export default function DashboardPage() {
  const { data: session } = useSession();
  const { workspace, members, children, loading, mutate: mutateWorkspace } = useWorkspace();
  const { scripts } = useScripts();
  const { videos } = useVideos();
  const { cards } = useContentCards();
  const { assets } = useBrandAssets();
  const { entries } = useRevenue();
  const { thumbnails } = useThumbnails();
  const [channelInput, setChannelInput] = useState("");
  const [syncingSubs, setSyncingSubs] = useState(false);

  const videosPublished = videos.filter((v) => v.reviewStatus === "approved").length;
  const pendingReview = videos.filter((v) => v.reviewStatus === "pending_review" && v.status === "ready").length;
  const thisMonthCents = entries
    .filter((e) => e.occurredOn.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, e) => sum + e.amountCents, 0);

  async function syncSubscribers() {
    if (!channelInput.trim()) return;
    setSyncingSubs(true);
    try {
      const res = await fetch(`/api/workspace/${workspace!.id}/youtube-subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channelInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error ?? "Failed to sync subscribers");
        return;
      }
      await mutateWorkspace();
    } finally {
      setSyncingSubs(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 01 · DISPATCH"
        title="Dashboard"
        subtitle={loading ? "Loading workspace…" : `${workspace?.type ?? "creator"} workspace`}
      />

      {session?.user?.name && (
        <p className="mb-8 text-lg text-muted-foreground">
          Welcome back,{" "}
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">
            {session.user.name}
          </span>
          .
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="flex flex-col border-0 bg-sky-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-sky-100">Videos Published</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="text-2xl font-bold text-white">{videosPublished}</p>
          </CardContent>
        </Card>
        <Card className="flex flex-col border-0 bg-rose-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-rose-100">YouTube Subscribers</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="mb-2 text-2xl font-bold text-white">
              {workspace?.youtubeSubscriberCount != null
                ? workspace.youtubeSubscriberCount.toLocaleString()
                : "—"}
            </p>
            <div className="flex gap-2">
              <input
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder={workspace?.youtubeChannelId ?? "@handle or UC..."}
                className="min-w-0 flex-1 rounded bg-white/20 px-2 py-1 text-xs text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-white/40"
                onKeyDown={(e) => e.key === "Enter" && syncSubscribers()}
              />
              <button
                onClick={syncSubscribers}
                disabled={syncingSubs || !channelInput.trim()}
                className="flex shrink-0 items-center gap-1 rounded bg-white/20 px-2 py-1 text-xs text-white hover:bg-white/30 disabled:opacity-50"
              >
                {syncingSubs ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Sync
              </button>
            </div>
          </CardContent>
        </Card>
        <Link href="/revenue" className="flex w-full">
          <Card className="flex w-full flex-col border-0 bg-emerald-500 transition hover:brightness-110">
            <CardHeader className="pb-2">
              <CardDescription className="text-emerald-100">Monthly Revenue</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-2xl font-bold text-white">${(thisMonthCents / 100).toFixed(0)}</p>
            </CardContent>
          </Card>
        </Link>
        <Card className="flex flex-col border-0 bg-violet-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-violet-100">Videos in Review</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="text-2xl font-bold text-white">{pendingReview}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8 grid grid-cols-10 gap-4">
        <Card className="col-span-10 flex flex-col sm:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardDescription className="font-mono text-[11px] uppercase tracking-[0.25em]">Content Pipeline</CardDescription>
              <CardTitle>Pipeline Overview</CardTitle>
            </div>
            <Link
              href="/content"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Open pipeline
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="divide-x divide-border flex">
              {CONTENT_STAGES.map((stage) => {
                const meta = STAGE_META[stage];
                const Icon = meta.icon;
                const count = cards.filter((c) => c.stage === stage).length;
                return (
                  <Link
                    key={stage}
                    href={`/content`}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1.5 px-1 py-2.5 text-center transition hover:bg-muted/50 first:rounded-l-lg last:rounded-r-lg"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {CONTENT_STAGE_LABELS[stage]}
                    </span>
                    <span className="text-sm font-bold tabular-nums">{count}</span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-10 flex flex-col sm:col-span-3">
          <CardHeader className="pb-3">
            <CardDescription className="font-mono text-[11px] uppercase tracking-[0.25em]">Due Dates</CardDescription>
            <CardTitle>Upcoming Deadlines</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {cards
              .filter((c) => c.dueDate != null)
              .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
              .slice(0, 3)
              .map((card) => {
                const days = daysUntil(card.dueDate!);
                return (
                  <Link
                    key={card.id}
                    href={`/content`}
                    className="mb-3 flex items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{card.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {CONTENT_STAGE_LABELS[card.stage]}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        days < 0
                          ? "text-red-400"
                          : days <= 2
                            ? "text-amber-400"
                            : "text-muted-foreground"
                      }`}
                    >
                      {days < 0
                        ? `${Math.abs(days)}d overdue`
                        : days === 0
                          ? "Today"
                          : `${days}d`}
                    </span>
                  </Link>
                );
              })}
            {cards.filter((c) => c.dueDate != null).length === 0 && (
              <p className="text-sm text-muted-foreground">No upcoming deadlines</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Link href="/content">
          <Card className="transition hover:border-primary/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-primary" />
                <CardTitle>Content Board</CardTitle>
              </div>
              <CardDescription>{cards.length} {cards.length === 1 ? "card" : "cards"}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/videos">
          <Card className="transition hover:border-primary/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                <CardTitle>Videos</CardTitle>
              </div>
              <CardDescription>
                {videos.length} total{pendingReview > 0 ? ` · ${pendingReview} awaiting review` : ""}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/ai-script">
          <Card className="transition hover:border-primary/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle>AI Scripts</CardTitle>
              </div>
              <CardDescription>{scripts.length} {scripts.length === 1 ? "script" : "scripts"}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/assets">
          <Card className="transition hover:border-primary/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <CardTitle>Brand Assets</CardTitle>
              </div>
              <CardDescription>{assets.length} {assets.length === 1 ? "file" : "files"}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/revenue">
          <Card className="transition hover:border-primary/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <CardTitle>Revenue</CardTitle>
              </div>
              <CardDescription>${(thisMonthCents / 100).toFixed(0)} this month</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/thumbnails">
          <Card className="transition hover:border-primary/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-primary" />
                <CardTitle>Thumbnails</CardTitle>
              </div>
              <CardDescription>{thumbnails.length} generated</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/team">
          <Card className="transition hover:border-primary/40">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <CardTitle>Team</CardTitle>
              </div>
              <CardDescription>{members.length} {members.length === 1 ? "member" : "members"}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {workspace?.type === "agency" && (
          <Link href="/team">
            <Card className="transition hover:border-primary/40">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <CardTitle>Client workspaces</CardTitle>
                </div>
                <CardDescription>{children.length} active</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}
      </div>
    </AppShell>
  );
}
