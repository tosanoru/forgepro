import { NextResponse } from "next/server";
import { db } from "@/db";
import { niches } from "@/db/schema";
import { recomputeNicheScore } from "@/lib/niche-finder-server";
import { checkCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/cron/niche-finder/recompute-scores — daily, scheduled after
 * snapshot-channels in vercel.json (06:00 UTC vs snapshot's 03:00, giving
 * the snapshot job time to finish first — there's no explicit job
 * dependency/ordering mechanism here, just a time gap, since there's no
 * job queue in this codebase to chain them properly).
 */
export async function GET(req: Request) {
  const authError = checkCronAuth(req);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  const allNiches = await db.select({ id: niches.id }).from(niches);
  let recomputed = 0;
  const errors: string[] = [];

  for (const niche of allNiches) {
    try {
      await recomputeNicheScore(niche.id);
      recomputed++;
    } catch (err) {
      errors.push(`${niche.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), totalNiches: allNiches.length, recomputed, errors });
}
