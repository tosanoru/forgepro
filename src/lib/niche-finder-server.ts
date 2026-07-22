import "server-only";
import { and, eq, lte, desc } from "drizzle-orm";
import { db } from "@/db";
import { niches, nicheChannels, channels, channelSnapshots } from "@/db/schema";
import { computeGrowthScore, estimateRpmRange } from "@/lib/niche-scoring";

/** Latest snapshot at or before `beforeDate` — used to find "~30 days ago" without requiring an exact date match. */
async function getSnapshotOnOrBefore(channelId: string, beforeDate: string) {
  const [row] = await db
    .select()
    .from(channelSnapshots)
    .where(and(eq(channelSnapshots.channelId, channelId), lte(channelSnapshots.snapshotDate, beforeDate)))
    .orderBy(desc(channelSnapshots.snapshotDate))
    .limit(1);
  return row ?? null;
}

async function getLatestSnapshot(channelId: string) {
  const [row] = await db
    .select()
    .from(channelSnapshots)
    .where(eq(channelSnapshots.channelId, channelId))
    .orderBy(desc(channelSnapshots.snapshotDate))
    .limit(1);
  return row ?? null;
}

/**
 * Competition score — NOT specified in the spec (only growthScore has a
 * formula there). This is a reasonable, undocumented-by-spec heuristic:
 * more channels actively competing in a niche, and higher average
 * subscriber counts among them, both push competition up. Same "heuristic,
 * revisit once there's real data" posture as growthScore.
 */
function computeCompetitionScore(channelCount: number, avgSubscribers: number): number {
  const countComponent = Math.min(channelCount / 50, 1) * 60; // saturates at 50 channels
  const sizeComponent = Math.min(avgSubscribers / 1_000_000, 1) * 40; // saturates at 1M avg subs
  return Math.round(countComponent + sizeComponent);
}

/** Recomputes growthScore, competitionScore, and RPM range for one niche from its channels' snapshot deltas. */
export async function recomputeNicheScore(nicheId: string): Promise<void> {
  const [niche] = await db.select().from(niches).where(eq(niches.id, nicheId)).limit(1);
  if (!niche) return;

  const channelRows = await db
    .select({ channel: channels })
    .from(nicheChannels)
    .innerJoin(channels, eq(nicheChannels.channelId, channels.id))
    .where(eq(nicheChannels.nicheId, nicheId));

  if (channelRows.length === 0) return;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const growthScores: number[] = [];
  let totalSubs = 0;
  let subsCounted = 0;

  for (const { channel } of channelRows) {
    const [latest, thirtyAgo] = await Promise.all([
      getLatestSnapshot(channel.id),
      getSnapshotOnOrBefore(channel.id, thirtyDaysAgo),
    ]);
    if (!latest) continue;

    growthScores.push(
      computeGrowthScore({
        subsNow: latest.subscriberCount,
        subs30dAgo: thirtyAgo?.subscriberCount ?? null,
        avgViewsLast10: latest.avgViewsLast10,
        subscriberCount: latest.subscriberCount,
        uploadsLast30d: latest.uploadsLast30d,
      }),
    );
    totalSubs += latest.subscriberCount;
    subsCounted++;
  }

  if (growthScores.length === 0) return;

  const avgGrowthScore = Math.round(growthScores.reduce((a, b) => a + b, 0) / growthScores.length);
  const avgSubs = subsCounted > 0 ? totalSubs / subsCounted : 0;
  const competitionScore = computeCompetitionScore(channelRows.length, avgSubs);
  const rpm = estimateRpmRange(niche.category);

  await db
    .update(niches)
    .set({
      growthScore: avgGrowthScore,
      competitionScore,
      estimatedRpmLow: String(rpm.low),
      estimatedRpmHigh: String(rpm.high),
      updatedAt: new Date(),
    })
    .where(eq(niches.id, nicheId));
}
