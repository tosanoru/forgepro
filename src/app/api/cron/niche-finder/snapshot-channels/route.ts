import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { channels, channelSnapshots, userTrackedChannels } from "@/db/schema";
import { fetchChannelStats, fetchChannelRecentVideos, chunk } from "@/lib/youtube-data";
import { checkCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/cron/niche-finder/snapshot-channels — daily, 03:00 UTC per
 * vercel.json. Pulls channels.list for every channel in the discovery
 * pool (not just tracked ones — the spec is explicit that this covers
 * "every channel in `channels`", since niche/growth scoring needs the
 * whole pool's data, not just what individual users track).
 *
 * Two-pass approach — keeps costs manageable while enriching the most
 * important channels:
 *
 *   Pass 1 (all channels) — channels.list, 1 unit per 50 IDs. With the
 *   default 10,000 unit/day quota, headroom for ~500k channel refreshes.
 *
 *   Pass 2 (tracked channels only) — fetchChannelRecentVideos, 3 units
 *   per channel (channels.list contentDetails + playlistItems.list +
 *   videos.list). Tracked channels are the ones users actively monitor,
 *   so their data quality matters most; the caller is making an explicit
 *   "I care about this channel" signal. A typical workspace has <50
 *   tracked channels, so this pass costs ~150 units — well within budget
 *   after the discovery cron (~5,200 units) and basic pass (~trivial).
 *
 *   avgViewsLast10 = mean viewCount of up to 10 most recent videos.
 *   uploadsLast30d = count of those within the last 30 days.
 */
export async function GET(req: Request) {
  const authError = checkCronAuth(req);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  const allChannels = await db.select().from(channels);
  const today = new Date().toISOString().slice(0, 10);

  let snapshotted = 0;
  const errors: string[] = [];

  for (const batch of chunk(allChannels, 50)) {
    try {
      const stats = await fetchChannelStats(batch.map((c) => c.youtubeChannelId));
      const statsById = new Map(stats.map((s) => [s.youtubeChannelId, s]));

      for (const channel of batch) {
        const stat = statsById.get(channel.youtubeChannelId);
        if (!stat) continue;

        await db
          .insert(channelSnapshots)
          .values({
            channelId: channel.id,
            subscriberCount: stat.subscriberCount,
            viewCount: stat.viewCount,
            videoCount: stat.videoCount,
            uploadsLast30d: null,
            avgViewsLast10: null,
            snapshotDate: today,
          })
          .onConflictDoUpdate({
            target: [channelSnapshots.channelId, channelSnapshots.snapshotDate],
            set: {
              subscriberCount: stat.subscriberCount,
              viewCount: stat.viewCount,
              videoCount: stat.videoCount,
            },
          });
        snapshotted++;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Unknown batch error");
    }
  }

  // Pass 2 — video enrichment for tracked channels only
  const trackedRows = await db
    .select({ channelId: userTrackedChannels.channelId })
    .from(userTrackedChannels);
  const trackedIds = new Set(trackedRows.map((r) => r.channelId));
  const trackedChannels = allChannels.filter((c) => trackedIds.has(c.id));
  const cutoff = Date.now() - 30 * 86_400_000;
  let enriched = 0;
  const enrichErrors: string[] = [];

  for (const channel of trackedChannels) {
    try {
      const videos = await fetchChannelRecentVideos(channel.youtubeChannelId, 25);
      let uploadsLast30d = 0;
      for (const v of videos) {
        if (new Date(v.publishedAt).getTime() > cutoff) uploadsLast30d++;
      }
      const recent10 = videos.slice(0, 10);
      const avgViewsLast10 =
        recent10.length > 0
          ? Math.round(recent10.reduce((s, v) => s + v.viewCount, 0) / recent10.length)
          : null;

      await db
        .update(channelSnapshots)
        .set({ uploadsLast30d, avgViewsLast10 })
        .where(and(eq(channelSnapshots.channelId, channel.id), eq(channelSnapshots.snapshotDate, today)));
      enriched++;
    } catch (err) {
      enrichErrors.push(`${channel.youtubeChannelId}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), totalChannels: allChannels.length, snapshotted, enriched, errors, enrichErrors });
}
