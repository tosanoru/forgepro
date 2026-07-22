import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { youtubeQuotaLog } from "@/db/schema";

const BASE_URL = "https://www.googleapis.com/youtube/v3";

/**
 * Best-effort — a quota-tracking write failing must never break the
 * actual YouTube call that already succeeded, so this swallows its own
 * errors rather than throwing. `onConflictDoUpdate` with a raw `sql`
 * increment is what makes concurrent calls on the same day add up
 * correctly instead of racing (two callers both reading `units: 5` and
 * both writing `units: 6` would lose one of the increments).
 */
async function recordYoutubeQuotaUsage(units: number): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(youtubeQuotaLog)
      .values({ date: today, units })
      .onConflictDoUpdate({
        target: youtubeQuotaLog.date,
        set: { units: sql`${youtubeQuotaLog.units} + ${units}`, updatedAt: new Date() },
      });
  } catch {
    // Quota tracking is observability, not a correctness requirement —
    // never let it take down a call that otherwise succeeded.
  }
}

/**
 * Uses a plain API key (YOUTUBE_API_KEY), not OAuth — this is public read
 * access to channel statistics, the same "public Data API, not OAuth
 * analytics" call the rest of this codebase already made for Forge's
 * original stats feature and for deliberately not building YouTube
 * Analytics revenue integration (see CLAUDE.md / Revenue Dashboard).
 * Separate from AUTH_GOOGLE_ID/SECRET, which are for login.
 */
function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Missing YOUTUBE_API_KEY environment variable.");
  return key;
}

export interface YoutubeChannelStats {
  youtubeChannelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
  country: string | null;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
}

/**
 * channels.list — 1 quota unit per call REGARDLESS of how many parts are
 * requested or how many of the (up to 50) IDs are batched in. This is the
 * entire reason the snapshot cron batches in groups of 50 instead of
 * calling once per channel: 500 channels tracked costs 10 units/day here,
 * not 500.
 *
 * All of statistics.subscriberCount/viewCount/videoCount come back as
 * STRINGS in the raw JSON (YouTube's quirk, confirmed against current
 * docs, not assumed) — parsed to numbers here so nothing downstream has
 * to remember that.
 */
export async function fetchChannelStats(youtubeChannelIds: string[]): Promise<YoutubeChannelStats[]> {
  if (youtubeChannelIds.length === 0) return [];
  if (youtubeChannelIds.length > 50) {
    throw new Error("fetchChannelStats accepts at most 50 channel IDs per call — batch upstream.");
  }

  const url = new URL(`${BASE_URL}/channels`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("id", youtubeChannelIds.join(","));
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube channels.list error [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const items: unknown[] = json.items ?? [];
  await recordYoutubeQuotaUsage(1); // channels.list(id) — 1 unit regardless of batch size

  return (
    items as Array<{
      id: string;
      snippet: { title: string; customUrl?: string; country?: string; thumbnails?: { default?: { url?: string } } };
      statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string };
    }>
  ).map((item) => ({
    youtubeChannelId: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl ?? null,
    thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
    country: item.snippet.country ?? null,
    subscriberCount: Number(item.statistics.subscriberCount ?? 0),
    viewCount: Number(item.statistics.viewCount ?? 0),
    videoCount: Number(item.statistics.videoCount ?? 0),
  }));
}

export interface YoutubeSearchResult {
  youtubeChannelId: string;
  title: string;
  thumbnailUrl: string | null;
}

/**
 * search.list — 100 quota units per call, the expensive one. Used only by
 * the weekly discovery cron, deliberately not by anything user-facing or
 * frequent: 10,000 units/day ÷ 100 = 100 searches/day maximum, full stop,
 * shared across every discovery sweep this runs. See CLAUDE.md for the
 * quota budgeting this implies.
 */
export async function searchChannelsByKeyword(query: string, maxResults = 25): Promise<YoutubeSearchResult[]> {
  const url = new URL(`${BASE_URL}/search`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(Math.min(maxResults, 50)));
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube search.list error [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const items: unknown[] = json.items ?? [];
  await recordYoutubeQuotaUsage(100); // search.list — 100 units regardless of maxResults

  return (
    items as Array<{ id: { channelId: string }; snippet: { title: string; thumbnails?: { default?: { url?: string } } } }>
  ).map((item) => ({
    youtubeChannelId: item.id.channelId,
    title: item.snippet.title,
    thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
  }));
}

export interface YoutubeRecentVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  viewCount: number;
  thumbnailUrl: string | null;
}

/**
 * channels.list(contentDetails) → playlistItems.list(uploads playlist) →
 * videos.list(statistics) = 1 + 1 + 1 = 3 quota units per call, regardless
 * of how many videos are returned (capped at 25 here). Cheap enough to
 * leave ungated by tier, same posture as the other per-channel lookups —
 * nothing like search_videos_by_topic's 101-unit cost, because this walks
 * one channel's known upload playlist instead of running a full-catalog
 * keyword search.
 *
 * This is what get_channel_content_pattern (MCP tool) uses to show real
 * upload cadence and per-video view counts for one channel — something
 * get_channel_stats' snapshot history can't show, since snapshots only
 * ever recorded channel-level totals (subscriberCount/viewCount/
 * videoCount), never individual video performance.
 */
export async function fetchChannelRecentVideos(youtubeChannelId: string, maxResults = 10): Promise<YoutubeRecentVideo[]> {
  const capped = Math.min(maxResults, 25);

  const channelUrl = new URL(`${BASE_URL}/channels`);
  channelUrl.searchParams.set("part", "contentDetails");
  channelUrl.searchParams.set("id", youtubeChannelId);
  channelUrl.searchParams.set("key", apiKey());
  const channelRes = await fetch(channelUrl.toString());
  if (!channelRes.ok) {
    const text = await channelRes.text().catch(() => "");
    throw new Error(`YouTube channels.list (contentDetails) error [${channelRes.status}]: ${text.slice(0, 300)}`);
  }
  const channelJson = await channelRes.json();
  const uploadsPlaylistId = channelJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads as string | undefined;
  if (!uploadsPlaylistId) {
    await recordYoutubeQuotaUsage(1); // channels.list only — spent before we learned there's no uploads playlist
    return [];
  }

  const playlistUrl = new URL(`${BASE_URL}/playlistItems`);
  playlistUrl.searchParams.set("part", "snippet");
  playlistUrl.searchParams.set("playlistId", uploadsPlaylistId);
  playlistUrl.searchParams.set("maxResults", String(capped));
  playlistUrl.searchParams.set("key", apiKey());
  const playlistRes = await fetch(playlistUrl.toString());
  if (!playlistRes.ok) {
    const text = await playlistRes.text().catch(() => "");
    throw new Error(`YouTube playlistItems.list error [${playlistRes.status}]: ${text.slice(0, 300)}`);
  }
  const playlistJson = await playlistRes.json();
  const items = (playlistJson.items ?? []) as Array<{
    snippet: { title: string; publishedAt: string; resourceId: { videoId: string }; thumbnails?: { default?: { url?: string } } };
  }>;
  if (items.length === 0) {
    await recordYoutubeQuotaUsage(2); // channels.list + playlistItems.list — no videos.list needed, nothing to look up
    return [];
  }

  const videoIds = items.map((i) => i.snippet.resourceId.videoId);
  const statsUrl = new URL(`${BASE_URL}/videos`);
  statsUrl.searchParams.set("part", "statistics");
  statsUrl.searchParams.set("id", videoIds.join(","));
  statsUrl.searchParams.set("key", apiKey());
  const statsRes = await fetch(statsUrl.toString());
  if (!statsRes.ok) {
    const text = await statsRes.text().catch(() => "");
    throw new Error(`YouTube videos.list error [${statsRes.status}]: ${text.slice(0, 300)}`);
  }
  const statsJson = await statsRes.json();
  const viewsById = new Map<string, number>(
    ((statsJson.items ?? []) as Array<{ id: string; statistics: { viewCount?: string } }>).map((i) => [i.id, Number(i.statistics.viewCount ?? 0)]),
  );
  await recordYoutubeQuotaUsage(3); // channels.list + playlistItems.list + videos.list — full path

  return items.map((item) => ({
    videoId: item.snippet.resourceId.videoId,
    title: item.snippet.title,
    publishedAt: item.snippet.publishedAt,
    viewCount: viewsById.get(item.snippet.resourceId.videoId) ?? 0,
    thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
  }));
}

export interface YoutubeVideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
}

/**
 * search.list(type=video) + videos.list(part=statistics) combined —
 * 100 + 1 = 101 quota units per call. This is the most expensive tool in
 * the MCP server by a wide margin (10x the weekly discovery cron's
 * per-call cost), which is why the MCP route gates it to Pro plans only
 * rather than degrading results like search_niches does for free tier:
 * a free-tier caller looping this tool could exhaust Forge 2's entire
 * daily 10,000-unit budget in ~99 calls and starve the snapshot/discovery
 * crons for everyone. Capped at 25 results/call for the same reason —
 * search.list's cost is per call, not per result, so there's no quota
 * benefit to a smaller page size, but a smaller page keeps the combined
 * videos.list lookup well under its own 50-id batch limit.
 */
export async function searchVideosByTopic(query: string, maxResults = 25): Promise<YoutubeVideoResult[]> {
  const capped = Math.min(maxResults, 25);

  const searchUrl = new URL(`${BASE_URL}/search`);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("maxResults", String(capped));
  searchUrl.searchParams.set("key", apiKey());

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const text = await searchRes.text().catch(() => "");
    throw new Error(`YouTube search.list (video) error [${searchRes.status}]: ${text.slice(0, 300)}`);
  }
  const searchJson = await searchRes.json();
  await recordYoutubeQuotaUsage(100); // search.list — spent regardless of how many results came back
  const searchItems = (searchJson.items ?? []) as Array<{
    id: { videoId: string };
    snippet: { title: string; channelTitle: string; channelId: string; publishedAt: string; thumbnails?: { default?: { url?: string } } };
  }>;
  if (searchItems.length === 0) return [];

  // videos.list is a single 1-unit call for up to 50 ids — batching isn't
  // needed here since capped is at most 25, but the explicit slice keeps
  // this safe if `capped` is ever raised past 50 later without noticing.
  const videoIds = searchItems.map((i) => i.id.videoId).slice(0, 50);
  const statsUrl = new URL(`${BASE_URL}/videos`);
  statsUrl.searchParams.set("part", "statistics");
  statsUrl.searchParams.set("id", videoIds.join(","));
  statsUrl.searchParams.set("key", apiKey());

  const statsRes = await fetch(statsUrl.toString());
  if (!statsRes.ok) {
    const text = await statsRes.text().catch(() => "");
    throw new Error(`YouTube videos.list error [${statsRes.status}]: ${text.slice(0, 300)}`);
  }
  const statsJson = await statsRes.json();
  const statsById = new Map<string, { viewCount?: string; likeCount?: string }>(
    ((statsJson.items ?? []) as Array<{ id: string; statistics: { viewCount?: string; likeCount?: string } }>).map((i) => [i.id, i.statistics]),
  );
  await recordYoutubeQuotaUsage(1); // videos.list — the search.list 100 was already recorded above

  return searchItems.map((item) => {
    const stats = statsById.get(item.id.videoId);
    return {
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
      thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
      publishedAt: item.snippet.publishedAt,
      viewCount: Number(stats?.viewCount ?? 0),
      likeCount: Number(stats?.likeCount ?? 0),
    };
  });
}


export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * channels.list?forHandle=... — 1 quota unit, same as the id-based lookup
 * above. This is what makes `find_channel_by_url` (MCP tool) cheap enough
 * to run live on every call instead of being restricted to the weekly
 * discovery cron like searchChannelsByKeyword: resolving a single handle
 * a user pastes in costs the same 1 unit as batch-refreshing 50 already-
 * tracked channels, nothing like the 100-unit search.list cost.
 */
export async function fetchChannelByHandle(handle: string): Promise<YoutubeChannelStats | null> {
  const url = new URL(`${BASE_URL}/channels`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("forHandle", handle.startsWith("@") ? handle : `@${handle}`);
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube channels.list (forHandle) error [${res.status}]: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  await recordYoutubeQuotaUsage(1); // channels.list(forHandle) — 1 unit whether or not a match was found
  const item = (json.items ?? [])[0] as
    | {
        id: string;
        snippet: { title: string; customUrl?: string; country?: string; thumbnails?: { default?: { url?: string } } };
        statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string };
      }
    | undefined;
  if (!item) return null;

  return {
    youtubeChannelId: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl ?? null,
    thumbnailUrl: item.snippet.thumbnails?.default?.url ?? null,
    country: item.snippet.country ?? null,
    subscriberCount: Number(item.statistics.subscriberCount ?? 0),
    viewCount: Number(item.statistics.viewCount ?? 0),
    videoCount: Number(item.statistics.videoCount ?? 0),
  };
}

/**
 * Accepts anything a human might paste: a full youtube.com/@handle or
 * /channel/UC... URL, a bare @handle, or a raw UC... channel id. Returns
 * a normalized { type, value } so callers know which lookup path to use
 * — YouTube's API requires forHandle and id as mutually exclusive params,
 * there's no single "just figure it out" endpoint.
 */
export function parseYoutubeIdentifier(input: string): { type: "channelId"; value: string } | { type: "handle"; value: string } | null {
  const trimmed = input.trim();

  const channelUrlMatch = trimmed.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (channelUrlMatch) return { type: "channelId", value: channelUrlMatch[1] };

  const handleUrlMatch = trimmed.match(/youtube\.com\/@([\w.-]+)/i);
  if (handleUrlMatch) return { type: "handle", value: handleUrlMatch[1] };

  if (/^UC[\w-]{22}$/.test(trimmed)) return { type: "channelId", value: trimmed };

  if (trimmed.startsWith("@")) return { type: "handle", value: trimmed.slice(1) };

  if (/^[\w.-]+$/.test(trimmed)) return { type: "handle", value: trimmed };

  return null;
}
