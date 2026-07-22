import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { eq, and, desc, gte, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { niches, channels, channelSnapshots, nicheChannels, userTrackedChannels, workspaces, mcpToolUsage } from "@/db/schema";
import { resolveMcpKey } from "@/lib/mcp-auth";
import { ensureWorkspace } from "@/lib/workspace";
import { normalizeTier, meetsTier, FREE_TIER_NICHE_LIMIT } from "@/lib/plan-limits";
import { fetchChannelByHandle, fetchChannelRecentVideos, fetchChannelStats, parseYoutubeIdentifier, searchVideosByTopic } from "@/lib/youtube-data";
import { estimateRpmRange } from "@/lib/niche-scoring";

/**
 * Resolves the caller's default workspace for tier-checking and
 * tracked-channel scoping. MCP tool calls have no browser session, so
 * there's no ACTIVE_WORKSPACE_COOKIE to read (see src/lib/
 * active-workspace.ts) — this always operates on whichever workspace
 * ensureWorkspace() considers primary (first joined), same fallback used
 * everywhere else before a browser session exists yet. An MCP key isn't
 * workspace-scoped (see schema.ts), so there's no more specific answer
 * available than "the user's default workspace" without adding a
 * workspace-selection concept to the MCP protocol itself, which the spec
 * doesn't ask for.
 */
async function resolveCallerWorkspace(userId: string, userEmail: string) {
  const workspaceId = await ensureWorkspace(userId, userEmail);
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return { workspaceId, plan: workspace?.plan ?? "free" };
}

/**
 * The Pro-tier gate on search_videos_by_topic stops free-tier abuse but
 * not a single Pro workspace looping the tool — at 101 quota units/call,
 * ~99 calls in a day exhausts the entire shared 10,000-unit budget and
 * starves the snapshot/discovery crons for every other workspace on the
 * platform. This is deliberately a hard daily cap per workspace, not a
 * sliding window — simpler to reason about, and "resets at midnight UTC"
 * is an easy thing to explain in the error message when someone hits it.
 */
const SEARCH_VIDEOS_DAILY_LIMIT = 15;

async function checkAndIncrementToolUsage(workspaceId: string, tool: string, dailyLimit: number): Promise<{ allowed: boolean; usedToday: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const [existing] = await db
    .select()
    .from(mcpToolUsage)
    .where(and(eq(mcpToolUsage.workspaceId, workspaceId), eq(mcpToolUsage.tool, tool), eq(mcpToolUsage.date, today)))
    .limit(1);

  if ((existing?.count ?? 0) >= dailyLimit) {
    return { allowed: false, usedToday: existing?.count ?? 0 };
  }

  // Increment unconditionally on the allowed path — this counts the call
  // that's about to happen, not just calls that already succeeded, which
  // is the conservative direction to round on a budget-protection limit.
  await db
    .insert(mcpToolUsage)
    .values({ workspaceId, tool, date: today, count: 1 })
    .onConflictDoUpdate({
      target: [mcpToolUsage.workspaceId, mcpToolUsage.tool, mcpToolUsage.date],
      set: { count: sql`${mcpToolUsage.count} + 1`, updatedAt: new Date() },
    });

  return { allowed: true, usedToday: (existing?.count ?? 0) + 1 };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_niches",
      {
        title: "Search Niches",
        description:
          "Search Forge 2's Niche Finder database for YouTube niches by category, growth score, and competition. Free-tier accounts see only the top 20 niches by growth score, with no filtering.",
        inputSchema: {
          category: z.string().optional().describe("Filter by category, e.g. 'finance', 'gaming'"),
          minGrowthScore: z.number().min(0).max(100).optional(),
          maxCompetitionScore: z.number().min(0).max(100).optional(),
          offset: z.number().min(0).optional().describe("Pagination offset — ignored on free tier, which always returns the fixed top 20"),
        },
      },
      async ({ category, minGrowthScore, maxCompetitionScore, offset }, extra) => {
        const auth = extra.authInfo!;
        const { plan } = await resolveCallerWorkspace(auth.clientId, auth.extra!.email as string);
        const isFree = normalizeTier(plan) === "free";
        const pageSize = isFree ? FREE_TIER_NICHE_LIMIT : 100;
        const pageOffset = isFree ? 0 : (offset ?? 0);

        const conditions = [];
        if (!isFree) {
          if (category) conditions.push(ilike(niches.category, category));
          if (minGrowthScore !== undefined) conditions.push(gte(niches.growthScore, minGrowthScore));
          if (maxCompetitionScore !== undefined) conditions.push(gte(niches.competitionScore, maxCompetitionScore));
        }

        const rows = await db
          .select()
          .from(niches)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(niches.growthScore))
          .limit(pageSize)
          .offset(pageOffset);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  niches: rows,
                  pagination: isFree ? undefined : { offset: pageOffset, pageSize, nextOffset: rows.length === pageSize ? pageOffset + pageSize : null },
                  note: isFree
                    ? "Free tier: showing top 20 niches by growth score, filters and pagination ignored. Upgrade to Lite or Pro for full filtering."
                    : undefined,
                  rpmDisclaimer: "estimatedRpmLow/High are rough category-based estimates, not measured data — see niche-scoring.ts.",
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "get_niche_details",
      {
        title: "Get Niche Details",
        description: "Get full detail for one niche, including its top channels and their latest stats.",
        inputSchema: { nicheId: z.string(), offset: z.number().min(0).optional().describe("Pagination offset into this niche's mapped channels") },
      },
      async ({ nicheId, offset }) => {
        const [niche] = await db.select().from(niches).where(eq(niches.id, nicheId)).limit(1);
        if (!niche) return { content: [{ type: "text", text: JSON.stringify({ error: "Niche not found" }) }], isError: true };
        const pageOffset = offset ?? 0;

        const channelRows = await db
          .select({ channel: channels })
          .from(nicheChannels)
          .innerJoin(channels, eq(nicheChannels.channelId, channels.id))
          .where(eq(nicheChannels.nicheId, nicheId))
          .limit(10)
          .offset(pageOffset);

        const topChannels = await Promise.all(
          channelRows.map(async ({ channel }) => {
            const [snap] = await db
              .select()
              .from(channelSnapshots)
              .where(eq(channelSnapshots.channelId, channel.id))
              .orderBy(desc(channelSnapshots.snapshotDate))
              .limit(1);
            return { ...channel, latestSnapshot: snap ?? null };
          }),
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { niche, channels: topChannels, pagination: { offset: pageOffset, pageSize: 10, nextOffset: topChannels.length === 10 ? pageOffset + 10 : null } },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "get_channel_stats",
      {
        title: "Get Channel Stats",
        description: "Get current stats and recent growth history for one channel by its Forge 2 channel id.",
        inputSchema: { channelId: z.string(), historyDays: z.number().min(1).max(365).optional() },
      },
      async ({ channelId, historyDays }) => {
        const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
        if (!channel) return { content: [{ type: "text", text: JSON.stringify({ error: "Channel not found" }) }], isError: true };

        const since = new Date(Date.now() - (historyDays ?? 30) * 86_400_000).toISOString().slice(0, 10);
        const history = await db
          .select()
          .from(channelSnapshots)
          .where(and(eq(channelSnapshots.channelId, channelId), gte(channelSnapshots.snapshotDate, since)))
          .orderBy(desc(channelSnapshots.snapshotDate));

        return { content: [{ type: "text", text: JSON.stringify({ channel, history }, null, 2) }] };
      },
    );

    server.registerTool(
      "track_channel",
      {
        title: "Track Channel",
        description: "Add a channel to your workspace's tracked list. Requires a Lite or Pro plan.",
        inputSchema: { channelId: z.string() },
      },
      async ({ channelId }, extra) => {
        const auth = extra.authInfo!;
        const { workspaceId, plan } = await resolveCallerWorkspace(auth.clientId, auth.extra!.email as string);

        if (!meetsTier(plan, "lite")) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "Channel tracking requires a Lite or Pro plan." }) }], isError: true };
        }

        const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
        if (!channel) return { content: [{ type: "text", text: JSON.stringify({ error: "Channel not found" }) }], isError: true };

        const [tracked] = await db
          .insert(userTrackedChannels)
          .values({ workspaceId, channelId, trackedBy: auth.clientId })
          .onConflictDoNothing()
          .returning();

        return { content: [{ type: "text", text: JSON.stringify({ tracked: tracked ?? "already tracked" }) }] };
      },
    );

    server.registerTool(
      "list_tracked_channels",
      {
        title: "List Tracked Channels",
        description: "List every channel your workspace is currently tracking.",
        inputSchema: {},
      },
      async (_args, extra) => {
        const auth = extra.authInfo!;
        const { workspaceId } = await resolveCallerWorkspace(auth.clientId, auth.extra!.email as string);

        const rows = await db
          .select({ tracked: userTrackedChannels, channel: channels })
          .from(userTrackedChannels)
          .innerJoin(channels, eq(userTrackedChannels.channelId, channels.id))
          .where(eq(userTrackedChannels.workspaceId, workspaceId));

        return { content: [{ type: "text", text: JSON.stringify(rows.map((r) => ({ ...r.tracked, channel: r.channel })), null, 2) }] };
      },
    );

    server.registerTool(
      "untrack_channel",
      {
        title: "Untrack Channel",
        description: "Remove a channel from your workspace's tracked list. Counterpart to track_channel.",
        inputSchema: { channelId: z.string() },
      },
      async ({ channelId }, extra) => {
        const auth = extra.authInfo!;
        const { workspaceId } = await resolveCallerWorkspace(auth.clientId, auth.extra!.email as string);

        const deleted = await db
          .delete(userTrackedChannels)
          .where(and(eq(userTrackedChannels.workspaceId, workspaceId), eq(userTrackedChannels.channelId, channelId)))
          .returning();

        return {
          content: [{ type: "text", text: JSON.stringify({ untracked: deleted.length > 0 }) }],
        };
      },
    );

    server.registerTool(
      "find_channel_by_url",
      {
        title: "Find Channel By URL",
        description:
          "Resolve a pasted YouTube URL, @handle, or channel ID into a Forge 2 channel record — the entry point for every other tool here, since MCP clients only ever have a URL, not an internal channelId. If the channel isn't in Forge 2's database yet, this fetches it live from YouTube (1 quota unit) and adds it, uncategorized, so it can immediately be tracked or compared.",
        inputSchema: { input: z.string().describe("A youtube.com URL, @handle, or raw UC... channel ID") },
      },
      async ({ input }) => {
        const parsed = parseYoutubeIdentifier(input);
        if (!parsed) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "Could not parse a YouTube channel URL, handle, or ID from that input." }) }], isError: true };
        }

        // Check Forge 2's own database first — free, no quota cost.
        const existing = await db
          .select()
          .from(channels)
          .where(parsed.type === "channelId" ? eq(channels.youtubeChannelId, parsed.value) : eq(channels.handle, parsed.value))
          .limit(1);
        if (existing[0]) {
          return { content: [{ type: "text", text: JSON.stringify({ channel: existing[0], source: "forge2_db" }, null, 2) }] };
        }

        // Not found locally — resolve live via YouTube (1 unit either path).
        const stats =
          parsed.type === "channelId" ? (await fetchChannelStats([parsed.value]))[0] ?? null : await fetchChannelByHandle(parsed.value);
        if (!stats) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "No YouTube channel found for that input." }) }], isError: true };
        }

        const [inserted] = await db
          .insert(channels)
          .values({
            youtubeChannelId: stats.youtubeChannelId,
            title: stats.title,
            handle: stats.handle,
            thumbnailUrl: stats.thumbnailUrl,
            country: stats.country,
          })
          .onConflictDoNothing()
          .returning();

        // onConflictDoNothing() returns [] on a race where another call
        // inserted the same youtubeChannelId a moment earlier — re-select
        // rather than treat that as an error.
        const channel = inserted ?? (await db.select().from(channels).where(eq(channels.youtubeChannelId, stats.youtubeChannelId)).limit(1))[0];

        return { content: [{ type: "text", text: JSON.stringify({ channel, source: "youtube_api", stats }, null, 2) }] };
      },
    );

    server.registerTool(
      "compare_channels",
      {
        title: "Compare Channels",
        description: "Compare current stats for 2-5 channels side by side — subscriber count, views, upload frequency, and latest growth score inputs.",
        inputSchema: { channelIds: z.array(z.string()).min(2).max(5) },
      },
      async ({ channelIds }) => {
        const channelRows = await db.select().from(channels).where(inArray(channels.id, channelIds));
        if (channelRows.length < 2) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "Need at least 2 valid channel IDs to compare." }) }], isError: true };
        }

        const comparison = await Promise.all(
          channelRows.map(async (channel) => {
            const [latest] = await db
              .select()
              .from(channelSnapshots)
              .where(eq(channelSnapshots.channelId, channel.id))
              .orderBy(desc(channelSnapshots.snapshotDate))
              .limit(1);
            return { channel, latestSnapshot: latest ?? null };
          }),
        );

        return { content: [{ type: "text", text: JSON.stringify({ comparison }, null, 2) }] };
      },
    );

    server.registerTool(
      "get_trending_channels",
      {
        title: "Get Trending Channels",
        description:
          "List the channels with the biggest subscriber growth over a recent window, optionally scoped to one category. Useful for spotting outliers within a niche rather than browsing the whole niche list.",
        inputSchema: {
          category: z.string().optional(),
          days: z.number().min(1).max(90).optional().describe("Lookback window, default 30"),
          limit: z.number().min(1).max(50).optional(),
          offset: z.number().min(0).optional().describe("Pagination offset into the sorted (by growth) results"),
        },
      },
      async ({ category, days, limit, offset }) => {
        const window = days ?? 30;
        const cap = limit ?? 20;
        const pageOffset = offset ?? 0;
        const since = new Date(Date.now() - window * 86_400_000).toISOString().slice(0, 10);

        const channelRows = await db
          .select()
          .from(channels)
          .where(category ? ilike(channels.category, category) : undefined);

        const withDeltas = await Promise.all(
          channelRows.map(async (channel) => {
            const [latest] = await db
              .select()
              .from(channelSnapshots)
              .where(eq(channelSnapshots.channelId, channel.id))
              .orderBy(desc(channelSnapshots.snapshotDate))
              .limit(1);
            const [oldest] = await db
              .select()
              .from(channelSnapshots)
              .where(and(eq(channelSnapshots.channelId, channel.id), gte(channelSnapshots.snapshotDate, since)))
              .orderBy(channelSnapshots.snapshotDate)
              .limit(1);
            if (!latest || !oldest || latest.id === oldest.id) return null;
            const subDelta = latest.subscriberCount - oldest.subscriberCount;
            return { channel, subDelta, subDeltaPct: oldest.subscriberCount > 0 ? subDelta / oldest.subscriberCount : null, latest };
          }),
        );

        // Sorted once across every matching channel, then paged — cheap
        // to slice since the full sort already happened above; a real
        // cursor (rather than offset) would only matter if this were
        // sorting in the database instead of in memory.
        const sortedTrending = withDeltas
          .filter((row): row is NonNullable<typeof row> => row !== null && row.subDelta > 0)
          .sort((a, b) => b.subDelta - a.subDelta);
        const trending = sortedTrending.slice(pageOffset, pageOffset + cap);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  trending,
                  pagination: {
                    offset: pageOffset,
                    pageSize: cap,
                    total: sortedTrending.length,
                    nextOffset: pageOffset + cap < sortedTrending.length ? pageOffset + cap : null,
                  },
                  note: trending.length === 0 ? "No channels have enough snapshot history yet for this window — the daily snapshot cron needs to run for a while first." : undefined,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "estimate_rpm",
      {
        title: "Estimate RPM",
        description:
          "Get a rough RPM (revenue per mille) estimate for any content category, even one not yet tracked as a niche. These are category-based ballpark ranges, not measured data — see the disclaimer in the response.",
        inputSchema: { category: z.string() },
      },
      async ({ category }) => {
        const { low, high } = estimateRpmRange(category);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  category,
                  estimatedRpmLow: low,
                  estimatedRpmHigh: high,
                  disclaimer: "Rough category-based estimate, not derived from measured CPM data. Treat as a starting point, not a forecast.",
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "search_videos_by_topic",
      {
        title: "Search Videos By Topic",
        description:
          "Search YouTube for videos matching a topic/keyword, with view and like counts. Pro plan only — this is the most quota-expensive call in the MCP server (101 units vs. 1 for most others), so it isn't degraded for lower tiers the way search_niches is, it's gated off entirely to protect the shared daily YouTube API quota that the snapshot and discovery crons also depend on. No pagination on this one deliberately: unlike search_niches/get_trending_channels (paginating a list already in Forge 2's own DB, free to page through), each additional page here would be another live search.list call — another 100+ units — against a tool that's already rate-limited to 15 calls/workspace/day specifically because of that cost. Narrow the query instead of paging through it.",
        inputSchema: {
          query: z.string(),
          maxResults: z.number().min(1).max(25).optional().describe("Default 25, hard-capped at 25"),
        },
      },
      async ({ query, maxResults }, extra) => {
        const auth = extra.authInfo!;
        const { workspaceId, plan } = await resolveCallerWorkspace(auth.clientId, auth.extra!.email as string);

        if (!meetsTier(plan, "pro")) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "search_videos_by_topic requires a Pro plan — it costs 101 YouTube API quota units per call, shared with the platform's snapshot and discovery crons.",
                }),
              },
            ],
            isError: true,
          };
        }

        const { allowed, usedToday } = await checkAndIncrementToolUsage(workspaceId, "search_videos_by_topic", SEARCH_VIDEOS_DAILY_LIMIT);
        if (!allowed) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Daily limit of ${SEARCH_VIDEOS_DAILY_LIMIT} search_videos_by_topic calls reached for this workspace (${usedToday} used). Resets at midnight UTC. This limit exists because each call costs 101 YouTube API quota units — the Pro-tier gate alone doesn't stop a single workspace from exhausting the platform's shared daily budget.`,
                }),
              },
            ],
            isError: true,
          };
        }

        const videos = await searchVideosByTopic(query, maxResults ?? 25);
        return { content: [{ type: "text", text: JSON.stringify({ videos, usageToday: usedToday, dailyLimit: SEARCH_VIDEOS_DAILY_LIMIT }, null, 2) }] };
      },
    );

    server.registerTool(
      "get_niche_history",
      {
        title: "Get Niche History",
        description:
          "Get a day-by-day trend for a niche: total subscribers and views summed across every channel mapped to it. Built from existing channel snapshots rather than a separate niche-level history table, so the trend is only as deep as the snapshot cron has been running — new niches will have little or no history yet.",
        inputSchema: { nicheId: z.string(), days: z.number().min(1).max(365).optional() },
      },
      async ({ nicheId, days }) => {
        const [niche] = await db.select().from(niches).where(eq(niches.id, nicheId)).limit(1);
        if (!niche) return { content: [{ type: "text", text: JSON.stringify({ error: "Niche not found" }) }], isError: true };

        const channelRows = await db.select({ channelId: nicheChannels.channelId }).from(nicheChannels).where(eq(nicheChannels.nicheId, nicheId));
        const channelIds = channelRows.map((r) => r.channelId);
        if (channelIds.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({ niche, history: [], note: "No channels mapped to this niche yet." }) }] };
        }

        const since = new Date(Date.now() - (days ?? 90) * 86_400_000).toISOString().slice(0, 10);
        const snapshots = await db
          .select()
          .from(channelSnapshots)
          .where(and(inArray(channelSnapshots.channelId, channelIds), gte(channelSnapshots.snapshotDate, since)))
          .orderBy(channelSnapshots.snapshotDate);

        // Sum subscriber/view counts across all of the niche's channels
        // per calendar day — a niche-level rollup of per-channel data
        // that already exists, not a new fact being tracked.
        const byDate = new Map<string, { snapshotDate: string; totalSubscribers: number; totalViews: number; channelsReporting: number }>();
        for (const snap of snapshots) {
          const entry = byDate.get(snap.snapshotDate) ?? { snapshotDate: snap.snapshotDate, totalSubscribers: 0, totalViews: 0, channelsReporting: 0 };
          entry.totalSubscribers += snap.subscriberCount;
          entry.totalViews += snap.viewCount;
          entry.channelsReporting += 1;
          byDate.set(snap.snapshotDate, entry);
        }

        const history = Array.from(byDate.values()).sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { niche, history, note: history.length === 0 ? "No snapshot history yet for this niche's channels — the daily snapshot cron needs to run for a while first." : undefined },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "get_channel_content_pattern",
      {
        title: "Get Channel Content Pattern",
        description:
          "Get a channel's recent uploads with individual view counts and publish dates — shows upload cadence and per-video performance, which channel-level snapshots (get_channel_stats) can't. 3 quota units per call.",
        inputSchema: {
          channelId: z.string().describe("Forge 2 channel id (use find_channel_by_url first if you only have a YouTube URL)"),
          limit: z.number().min(1).max(25).optional(),
        },
      },
      async ({ channelId, limit }) => {
        const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
        if (!channel) return { content: [{ type: "text", text: JSON.stringify({ error: "Channel not found" }) }], isError: true };

        const videos = await fetchChannelRecentVideos(channel.youtubeChannelId, limit ?? 10);
        const gaps = videos
          .map((v) => new Date(v.publishedAt).getTime())
          .sort((a, b) => b - a)
          .slice(0, -1)
          .map((t, i, arr) => (i === 0 ? t : arr[i - 1]) - t)
          .map((ms) => Math.round(ms / 86_400_000));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  channel,
                  videos,
                  avgDaysBetweenUploads: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "list_niche_categories",
      {
        title: "List Niche Categories",
        description: "List every distinct category currently in Forge 2's niche database — use this before search_niches to know what category values are valid, rather than guessing.",
        inputSchema: {},
      },
      async () => {
        const rows = await db.selectDistinct({ category: niches.category }).from(niches).orderBy(niches.category);
        return { content: [{ type: "text", text: JSON.stringify({ categories: rows.map((r) => r.category) }) }] };
      },
    );
  },
  { serverInfo: { name: "forge2-niche-finder", version: "1.0.0" } },
  { verboseLogs: false, maxDuration: 30 },
);

/**
 * Bearer-token auth wrapping the whole handler — resolveMcpKey (src/lib/
 * mcp-auth.ts) is the same key-hash lookup used nowhere else, since MCP
 * clients can't do the cookie/session auth every other route in Forge 2
 * uses. userId goes in `clientId` (AuthInfo's designated identifier
 * field); email has to ride in `extra` since AuthInfo has no dedicated
 * field for it, and ensureWorkspace() needs an email for its pending-
 * invite-claim path.
 */
const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    const resolved = await resolveMcpKey(bearerToken ?? null);
    if (!resolved) return undefined;
    return {
      token: bearerToken!,
      clientId: resolved.userId,
      scopes: ["niche-finder"],
      extra: { email: resolved.user.email },
    };
  },
  { required: true },
);

export { authHandler as GET, authHandler as POST };
