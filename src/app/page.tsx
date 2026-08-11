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
import { useAcademyCourses, useMyBadges } from "@/lib/use-academy";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Users, Building2, Sparkles, Video, LayoutGrid, FolderOpen, DollarSign, Image, RefreshCw, ArrowUpRight, GraduationCap, PlayCircle, Award } from "lucide-react";
import Link from "next/link";
import { CONTENT_STAGES, CONTENT_STAGE_LABELS, daysUntil } from "@/lib/content-types";
import { STAGE_META } from "@/lib/content-meta";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { workspace, members, children, loading, mutate: mutateWorkspace } = useWorkspace();
  const { scripts } = useScripts();
  const { videos } = useVideos();
  const { cards } = useContentCards();
  const { assets } = useBrandAssets();
  const { entries } = useRevenue();
  const { thumbnails } = useThumbnails();
  const { data: academy } = useAcademyCourses();
  const { data: badgesData } = useMyBadges();
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
        eyebrow={workspace?.type ?? "workspace"}
        title="Dashboard"
        subtitle={loading ? "Loading workspace\u2026" : session?.user?.name ? `Welcome back, ${session.user.name}` : undefined}
      />

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="border-l-2 border-l-emerald-stat">
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-stat" />
              Published
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold tracking-tight">{videosPublished}</p>
          </CardContent>
        </Card>
        <Card className="border-l-2 border-l-indigo-stat">
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-stat" />
              Subscribers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold tracking-tight">
              {workspace?.youtubeSubscriberCount != null
                ? workspace.youtubeSubscriberCount.toLocaleString()
                : "\u2014"}
            </p>
            <div className="mt-2 flex gap-1.5">
              <input
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                placeholder={workspace?.youtubeChannelId ?? "@handle or UC\u2026"}
                className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs text-foreground placeholder-muted-foreground/50 outline-none transition-colors focus:border-ring focus:ring-0"
                onKeyDown={(e) => e.key === "Enter" && syncSubscribers()}
              />
              <button
                onClick={syncSubscribers}
                disabled={syncingSubs || !channelInput.trim()}
                className="flex shrink-0 items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {syncingSubs ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Sync
              </button>
            </div>
          </CardContent>
        </Card>
        <Link href="/revenue" className="flex w-full">
          <Card className="w-full border-l-2 border-l-amber-stat transition hover:shadow-md">
            <CardHeader className="pb-1.5">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <div className="h-1.5 w-1.5 rounded-full bg-amber-stat" />
                Monthly Revenue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl font-bold tracking-tight">${(thisMonthCents / 100).toFixed(0)}</p>
            </CardContent>
          </Card>
        </Link>
        <Card className="border-l-2 border-l-rose-stat">
          <CardHeader className="pb-1.5">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <div className="h-1.5 w-1.5 rounded-full bg-rose-stat" />
              In Review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold tracking-tight">{pendingReview}</p>
          </CardContent>
        </Card>
      </div>

      {academy?.courses.some((c) => c.enrolled && c.progress.percent < 100) && (
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Academy</p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {academy!.courses
              .filter((c) => c.enrolled && c.progress.percent < 100)
              .slice(0, 4)
              .map((course) => (
                <Link key={course.id} href={`/academy/${course.slug}`}>
                  <Card className="card-hover h-full">
                    <CardContent className="p-5">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{course.title}</p>
                          <span className="text-xs capitalize text-muted-foreground">{course.level}</span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[11px] font-medium text-primary">
                          <PlayCircle className="h-3 w-3" />
                          {course.progress.percent >= 100 ? "Complete" : "Continue"}
                        </span>
                      </div>
                      <Progress value={course.progress.percent} />
                      <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {course.progress.completedLessons}/{course.progress.totalLessons} lessons ·{" "}
                        {course.progress.percent}%
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        </div>
      )}

      {badgesData?.badges.length ? (
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-stat" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Badges ({badgesData.badges.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {badgesData.badges.slice(0, 12).map((b) => (
              <div
                key={b.id}
                title={b.description}
                className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2"
              >
                {b.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.iconUrl} alt="" className="h-5 w-5 rounded" />
                ) : (
                  <Award className="h-5 w-5 text-amber-stat" />
                )}
                <span className="text-xs font-medium">{b.title}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mb-10 grid grid-cols-10 gap-4">
        <Card className="col-span-10 sm:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <p className="mb-0.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Pipeline</p>
              <CardTitle>Content Pipeline</CardTitle>
            </div>
            <Link
              href="/content"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Open <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-stretch divide-x divide-border">
              {CONTENT_STAGES.map((stage) => {
                const meta = STAGE_META[stage];
                const Icon = meta.icon;
                const count = cards.filter((c) => c.stage === stage).length;
                return (
                  <Link
                    key={stage}
                    href="/content"
                    className="flex flex-1 flex-col items-center gap-1.5 px-1 py-3 text-center transition-colors hover:bg-muted/50 first:rounded-bl-lg last:rounded-br-lg"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {CONTENT_STAGE_LABELS[stage]}
                    </span>
                    <span className="font-mono text-sm font-bold tabular-nums">{count}</span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-10 sm:col-span-3">
          <CardHeader className="pb-4">
            <p className="mb-0.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Due Dates</p>
            <CardTitle>Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            {cards
              .filter((c) => c.dueDate != null)
              .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
              .slice(0, 4)
              .map((card) => {
                const days = daysUntil(card.dueDate!);
                return (
                  <Link
                    key={card.id}
                    href="/content"
                    className="mb-2 flex items-center gap-3 rounded-lg border border-border p-3 transition-colors last:mb-0 hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{card.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {CONTENT_STAGE_LABELS[card.stage]}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs font-medium ${
                        days < 0
                          ? "text-destructive"
                          : days <= 2
                            ? "text-amber-stat"
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
              <p className="py-6 text-center text-sm text-muted-foreground">No upcoming deadlines</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Modules</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/content">
            <Card className="card-hover">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary">
                  <LayoutGrid className="h-4 w-4 text-foreground" />
                </div>
                <CardTitle className="text-sm">Content Board</CardTitle>
                <CardDescription>{cards.length} {cards.length === 1 ? "card" : "cards"}</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/videos">
            <Card className="card-hover">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary">
                  <Video className="h-4 w-4 text-foreground" />
                </div>
                <CardTitle className="text-sm">Videos</CardTitle>
                <CardDescription>
                  {videos.length} total{pendingReview > 0 ? ` \u00B7 ${pendingReview} to review` : ""}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/ai-script">
            <Card className="card-hover">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary">
                  <Sparkles className="h-4 w-4 text-foreground" />
                </div>
                <CardTitle className="text-sm">AI Scripts</CardTitle>
                <CardDescription>{scripts.length} {scripts.length === 1 ? "script" : "scripts"}</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/assets">
            <Card className="card-hover">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary">
                  <FolderOpen className="h-4 w-4 text-foreground" />
                </div>
                <CardTitle className="text-sm">Brand Assets</CardTitle>
                <CardDescription>{assets.length} {assets.length === 1 ? "file" : "files"}</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/revenue">
            <Card className="card-hover">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary">
                  <DollarSign className="h-4 w-4 text-foreground" />
                </div>
                <CardTitle className="text-sm">Revenue</CardTitle>
                <CardDescription>${(thisMonthCents / 100).toFixed(0)} this month</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/thumbnails">
            <Card className="card-hover">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary">
                  <Image className="h-4 w-4 text-foreground" />
                </div>
                <CardTitle className="text-sm">Thumbnails</CardTitle>
                <CardDescription>{thumbnails.length} generated</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/team">
            <Card className="card-hover">
              <CardHeader>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary">
                  <Users className="h-4 w-4 text-foreground" />
                </div>
                <CardTitle className="text-sm">Team</CardTitle>
                <CardDescription>{members.length} {members.length === 1 ? "member" : "members"}</CardDescription>
              </CardHeader>
            </Card>
          </Link>

          {workspace?.type === "agency" && (
            <Link href="/team">
              <Card className="card-hover">
                <CardHeader>
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary">
                    <Building2 className="h-4 w-4 text-foreground" />
                  </div>
                  <CardTitle className="text-sm">Client Workspaces</CardTitle>
                  <CardDescription>{children.length} active</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}