import { NextResponse } from "next/server";
import { and, gte, lte, eq, desc, ilike, type SQL } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { niches, workspaces } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { normalizeTier, FREE_TIER_NICHE_LIMIT } from "@/lib/plan-limits";

/**
 * GET /api/niche-finder/niches — filterable niche list. Supports the
 * spec's "21-filter parity" ambition as a handful of the highest-value
 * filters (category, growth score range, competition range, min RPM) —
 * not literally 21 query params, since the spec doesn't enumerate what
 * the other ~17 NexLev filters are. Add more as real usage shows which
 * ones people actually want; a filter nobody uses is just surface area.
 *
 * Free tier: capped to the top 20 by growth score, no filtering beyond
 * that — matches "Browse top 20 niches" in the spec's tier table.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const tier = normalizeTier(workspace?.plan ?? "free");
  const isFree = tier === "free";

  const category = url.searchParams.get("category");
  const minGrowth = url.searchParams.get("minGrowthScore");
  const maxCompetition = url.searchParams.get("maxCompetitionScore");
  const minRpm = url.searchParams.get("minRpm");
  const search = url.searchParams.get("q");

  const conditions: SQL[] = [];
  if (!isFree) {
    if (category) conditions.push(eq(niches.category, category));
    if (minGrowth) conditions.push(gte(niches.growthScore, Number(minGrowth)));
    if (maxCompetition) conditions.push(lte(niches.competitionScore, Number(maxCompetition)));
    if (minRpm) conditions.push(gte(niches.estimatedRpmLow, minRpm));
    if (search) conditions.push(ilike(niches.name, `%${search}%`));
  }

  const rows = await db
    .select()
    .from(niches)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(niches.growthScore))
    .limit(isFree ? FREE_TIER_NICHE_LIMIT : 200);

  return NextResponse.json({ niches: rows, tier, limited: isFree });
}
