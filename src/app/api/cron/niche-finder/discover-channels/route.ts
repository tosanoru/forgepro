import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { channels, niches, nicheChannels, nicheDiscoveryCategories } from "@/db/schema";
import { searchChannelsByKeyword } from "@/lib/youtube-data";
import { checkCronAuth } from "@/lib/cron-auth";
import { DEFAULT_NICHE_CATEGORIES } from "@/lib/niche-category-defaults";

/**
 * GET /api/cron/niche-finder/discover-channels — daily (see vercel.json;
 * moved from weekly). 2 seed-keyword search.list calls per category —
 * at 100 units each, 26 categories × 2 keywords = 52 calls = 5,200
 * units/day against the 10,000/day budget. That leaves ~4,800 units of
 * headroom for the daily snapshot job (1 unit per 50 tracked channels —
 * trivial at current scale, but this headroom is what lets the tracked-
 * channel pool grow into the thousands before snapshotting becomes the
 * binding constraint instead of discovery) plus a safety margin for
 * ad-hoc MCP tool calls (find_channel_by_url, get_channel_content_pattern)
 * that share this same quota project (see .env.example).
 *
 * Categories and keywords now live in nicheDiscoveryCategories (DB), not
 * hardcoded here — editable at /admin → Niche Categories without a
 * redeploy. On a completely fresh install (empty table), this seeds the
 * same 26 categories that used to be hardcoded, once, so the cron isn't
 * a no-op on day one before anyone's visited the admin page.
 *
 * One niche per category is created/reused here (matching niche.name to
 * category name) as the v1 simplification — the schema allows many niches
 * per category, but nothing yet needs more than one, so this doesn't
 * build UI/logic for niche curation beyond category-level grouping.
 */
async function getActiveCategories(): Promise<Array<{ category: string; keywords: string[] }>> {
  const existing = await db.select().from(nicheDiscoveryCategories).limit(1);
  if (existing.length === 0) {
    await db
      .insert(nicheDiscoveryCategories)
      .values(Object.entries(DEFAULT_NICHE_CATEGORIES).map(([category, keywords]) => ({ category, keywords })))
      .onConflictDoNothing();
  }
  const rows = await db.select().from(nicheDiscoveryCategories).where(eq(nicheDiscoveryCategories.active, true));
  return rows.map((r) => ({ category: r.category, keywords: r.keywords }));
}

export async function GET(req: Request) {
  const authError = checkCronAuth(req);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  let discovered = 0;
  let linked = 0;
  const errors: string[] = [];
  const activeCategories = await getActiveCategories();

  for (const { category, keywords } of activeCategories) {
    const [niche] = await db
      .insert(niches)
      .values({ name: category, category })
      .onConflictDoNothing()
      .returning();
    const nicheId = niche?.id ?? (await db.select().from(niches).where(eq(niches.category, category)).limit(1))[0]?.id;
    if (!nicheId) continue;

    for (const keyword of keywords) {
      try {
        const results = await searchChannelsByKeyword(keyword, 50);

        for (const result of results) {
          const [existing] = await db.select().from(channels).where(eq(channels.youtubeChannelId, result.youtubeChannelId)).limit(1);

          const channelId =
            existing?.id ??
            (
              await db
                .insert(channels)
                .values({
                  youtubeChannelId: result.youtubeChannelId,
                  title: result.title,
                  thumbnailUrl: result.thumbnailUrl,
                  category,
                })
                .onConflictDoNothing()
                .returning()
            )[0]?.id;

          if (!channelId) continue;
          if (!existing) discovered++;

          const [link] = await db
            .insert(nicheChannels)
            .values({ nicheId, channelId })
            .onConflictDoNothing()
            .returning();
          if (link) linked++;
        }
      } catch (err) {
        errors.push(`${category} (${keyword}): ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), discovered, linked, errors });
}
