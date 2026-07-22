"use client";

import { useParams } from "next/navigation";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useChannelDetail, useTrackedChannels } from "@/lib/use-niche-finder";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function ChannelDetailPage() {
  const params = useParams<{ id: string }>();
  const { channel, latestSnapshot, history, loading } = useChannelDetail(params.id);
  const { track } = useTrackedChannels();

  if (loading || !channel) {
    return (
      <AppShell>
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading channel…
        </div>
      </AppShell>
    );
  }

  const chartData = history.map((s) => ({ date: s.snapshotDate.slice(5), subscribers: s.subscriberCount }));

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 09 · CHANNEL"
        title={channel.title}
        subtitle={channel.category ?? undefined}
        action={
          <div className="flex gap-2">
            <a href={`https://youtube.com/channel/${channel.youtubeChannelId}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5" /> View on YouTube
              </Button>
            </a>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await track(channel.id);
                  toast.success("Added to tracked channels");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to track");
                }
              }}
            >
              <BookmarkPlus className="h-3.5 w-3.5" /> Track
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Subscribers</CardDescription>
            <CardTitle className="font-mono text-2xl">{latestSnapshot?.subscriberCount.toLocaleString() ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total views</CardDescription>
            <CardTitle className="font-mono text-2xl">{latestSnapshot?.viewCount.toLocaleString() ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Videos</CardDescription>
            <CardTitle className="font-mono text-2xl">{latestSnapshot?.videoCount.toLocaleString() ?? "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Subscriber growth — last 90 days</CardTitle>
          <CardDescription>
            {chartData.length < 2 ? "Not enough snapshot history yet to chart a trend." : undefined}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length >= 2 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }} />
                  <Line type="monotone" dataKey="subscribers" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
              Check back once the daily snapshot pipeline has run a few times.
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
