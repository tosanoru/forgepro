import { NextResponse } from "next/server";
import { eq, and, lte, desc } from "drizzle-orm";
import { db } from "@/db";
import { channels, channelSnapshots } from "@/db/schema";
import { checkCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/cron/niche-finder/prune-stale — monthly. Drops channels with
 * "no uploads in 12mo" per the spec, approximated as: videoCount hasn't
 * increased between the latest snapshot and the closest snapshot from
 * ~365 days ago. channels.list doesn't return a per-video upload date, so
 * there's no direct way to check "last upload was N days ago" — video
 * count staleness over a year is the closest honest proxy available from
 * this API without a much more expensive per-channel videos.list pass.
 *
 * Channels with fewer than ~365 days of snapshot history are never
 * pruned by this — there's no way to know if a channel discovered last
 * month has gone stale yet, so it's left alone rather than guessed at.
 * This means pruning effectively does nothing for roughly the first year
 * this pipeline runs, which is expected, not a bug.
 */
export async function GET(req: Request) {
  const authError = checkCronAuth(req);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  const allChannels = await db.select().from(channels);
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

  let pruned = 0;
  let skippedInsufficientHistory = 0;

  const errors: string[] = [];

  for (const channel of allChannels) {
    try {
      const [latest] = await db
        .select()
        .from(channelSnapshots)
        .where(eq(channelSnapshots.channelId, channel.id))
        .orderBy(desc(channelSnapshots.snapshotDate))
        .limit(1);

      const [yearOldSnapshot] = await db
        .select()
        .from(channelSnapshots)
        .where(and(eq(channelSnapshots.channelId, channel.id), lte(channelSnapshots.snapshotDate, yearAgo)))
        .orderBy(desc(channelSnapshots.snapshotDate))
        .limit(1);

      if (!latest || !yearOldSnapshot) {
        skippedInsufficientHistory++;
        continue;
      }

      if (latest.videoCount <= yearOldSnapshot.videoCount) {
        await db.delete(channels).where(eq(channels.id, channel.id));
        pruned++;
      }
    } catch (err) {
      errors.push(`${channel.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      continue;
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    totalChannels: allChannels.length,
    pruned,
    skippedInsufficientHistory,
  });
}
