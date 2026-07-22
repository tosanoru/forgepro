# Niche Finder — Forge 2 Module Spec

**Module:** `niche-finder`
**Parent product:** Forge 2 (Next.js 16, Neon/Drizzle, Auth.js v5, Cloudflare R2)
**Reference:** nexlev.io (Niche Finder + Chrome Extension + MCP)
**Status:** Draft v1 — for Claude Code handoff

---

## 1. Goal

Give Forge 2 users (YouTubers, podcasters, agencies) a niche/channel research tool: discover growing "faceless" YouTube niches, track channels over time, estimate RPM/revenue potential, and expose the same data as MCP tools so users can query it from Claude/ChatGPT/Cursor.

v1 scope: Niche Finder + Channel Tracker + RPM Predictor + MCP server.
v2 (deferred): Chrome Extension (separate repo/manifest).

---

## 2. Data Model (Drizzle / Postgres)

```ts
// schema/niche-finder.ts

export const channels = pgTable('channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  youtubeChannelId: text('youtube_channel_id').notNull().unique(),
  title: text('title').notNull(),
  handle: text('handle'),
  thumbnailUrl: text('thumbnail_url'),
  category: text('category'), // mapped niche category, not raw YT category
  isFaceless: boolean('is_faceless').default(false),
  country: text('country'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const channelSnapshots = pgTable('channel_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  channelId: uuid('channel_id').references(() => channels.id).notNull(),
  subscriberCount: integer('subscriber_count').notNull(),
  viewCount: bigint('view_count', { mode: 'number' }).notNull(),
  videoCount: integer('video_count').notNull(),
  uploadsLast30d: integer('uploads_last_30d'),
  avgViewsLast10: bigint('avg_views_last_10', { mode: 'number' }),
  snapshotDate: date('snapshot_date').notNull(),
}, (t) => ({
  uniqDaily: unique().on(t.channelId, t.snapshotDate),
}));

export const niches = pgTable('niches', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  estimatedRpmLow: numeric('estimated_rpm_low'),
  estimatedRpmHigh: numeric('estimated_rpm_high'),
  competitionScore: integer('competition_score'), // 0-100
  growthScore: integer('growth_score'), // 0-100
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const nicheChannels = pgTable('niche_channels', {
  nicheId: uuid('niche_id').references(() => niches.id).notNull(),
  channelId: uuid('channel_id').references(() => channels.id).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.nicheId, t.channelId] }),
}));

export const userTrackedChannels = pgTable('user_tracked_channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  channelId: uuid('channel_id').references(() => channels.id).notNull(),
  notifyOnGrowthSpike: boolean('notify_on_growth_spike').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const mcpApiKeys = pgTable('mcp_api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  keyHash: text('key_hash').notNull().unique(),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Indexes:** `channel_snapshots(channel_id, snapshot_date desc)`, `channels(category)`, `niches(growth_score desc)`.

---

## 3. Data Pipeline

YouTube Data API v3 quota is the binding constraint (10k units/day default; `search.list` = 100 units, `channels.list` = 1 unit). Design around batch snapshotting, not live queries.

**Cron jobs (Vercel Cron or Cloudflare Cron Triggers):**

| Job | Frequency | Purpose |
|---|---|---|
| `snapshot-tracked-channels` | Daily, 03:00 UTC | Pull stats for every channel in `channels` via `channels.list` (up to 50 IDs/call — batch efficiently) |
| `discover-new-channels` | Weekly | `search.list` sweeps per seed keyword/category to grow channel coverage |
| `recompute-niche-scores` | Daily, after snapshot job | Recalculate `growthScore`/`competitionScore`/RPM range per niche from snapshot deltas |
| `prune-stale-channels` | Monthly | Drop channels with no uploads in 12mo from active discovery pool |

**Quota budgeting:** with 10k units/day, `channels.list` at 1 unit/call (50 channels/call) supports ~500k channel refreshes/day — plenty. Reserve a separate quota-tracked project/key for `search.list` discovery since it's expensive; consider a paid quota increase once usage data justifies it.

**Growth score formula (v1, heuristic):**
```
growthScore = normalize(
  (subs_now - subs_30d_ago) / subs_30d_ago * 0.5 +
  (avgViewsLast10 / subscriberCount) * 0.3 +
  (uploadsLast30d / 30) * 0.2
)
```

**RPM estimate:** category-based lookup table (seed from public CPM benchmark data) adjusted by an "audience geography" proxy (view velocity in known high-CPM regions is hard to get from public API — flag this as an estimate, not fact, in the UI, same disclaimer language NexLev uses).

---

## 4. API Routes (Next.js 16 route handlers)

```
GET  /api/niche-finder/niches                 — list/filter niches (21-filter parity: category, growthScore range, rpm range, competition, faceless-only, country, uploadFrequency...)
GET  /api/niche-finder/niches/:id              — niche detail + top channels
GET  /api/niche-finder/channels/:id            — channel detail + snapshot history (for charting)
GET  /api/niche-finder/channels/:id/history     — time-series snapshots (for growth chart)
POST /api/niche-finder/tracked-channels        — track a channel
DELETE /api/niche-finder/tracked-channels/:id  — untrack
GET  /api/niche-finder/tracked-channels        — user's tracked list + latest deltas
POST /api/niche-finder/mcp-keys                — generate MCP API key
DELETE /api/niche-finder/mcp-keys/:id
```

All routes behind Auth.js v5 session + tier gate (`niche-finder:read` requires Pro tier).

---

## 5. MCP Server

Separate route acting as MCP endpoint: `/api/mcp/niche-finder`, authenticated via the `mcpApiKeys` table (bearer token, not session cookie — MCP clients like Claude Desktop/Cursor can't do cookie auth).

**Tool list (v1):**

- `search_niches(category?, min_growth_score?, min_rpm?, faceless_only?)` → ranked niche list
- `get_niche_details(niche_id)` → full niche stats + top 10 channels
- `get_channel_stats(channel_id | youtube_url)` → current stats + 30/90-day growth
- `get_channel_history(channel_id, days)` → time-series for charting/analysis
- `list_tracked_channels()` → user's tracked channels with latest deltas
- `track_channel(youtube_url)` → add to tracked list

Build with `@modelcontextprotocol/sdk`, expose via HTTP/SSE transport per Forge 2's existing Node runtime routes. Rate-limit per API key (e.g., 100 calls/hour on Lite, unlimited on Pro).

---

## 6. Frontend

New module under Forge 2's module nav: **Niche Finder**

- `/niche-finder` — filterable/sortable niche table (server component + client filter bar), acid-yellow accent on growth-score badges, monospace for all numeric columns (subs, RPM, growth %) per your data-font convention
- `/niche-finder/[nicheId]` — niche detail: channel list, RPM range, growth chart (recharts, dark theme)
- `/niche-finder/channels/[channelId]` — channel deep-dive with historical chart
- `/niche-finder/tracked` — user's tracked channels dashboard
- `/niche-finder/mcp` — API key management + copy-paste MCP config snippet (mirrors NexLev's "30 seconds to connect" onboarding)

---

## 7. Tiering

| Tier | Access |
|---|---|
| Free | Browse top 20 niches, no channel tracking, no MCP |
| Lite | Full niche browse + filters, no tracking limit info yet decided |
| Pro | + Channel tracking, growth alerts, MCP server access |

(Adjust to match Forge 2's existing tier names/billing table — plug into current Stripe/subscription schema rather than inventing a new one.)

---

## 8. Build Phases

1. **Schema + seed data** — migrate tables, seed ~500 channels across 10-15 niche categories manually or via one-time `search.list` sweep
2. **Snapshot cron + growth scoring** — get the daily pipeline running for a week before building UI, so there's real delta data to display
3. **Niche Finder UI** — table, filters, detail pages
4. **Channel tracking + alerts**
5. **MCP server** — tools + key management UI
6. (Later) Chrome Extension as separate repo

---

## Open Questions for Tosan

- RPM benchmark source — do you have a CPM dataset, or should this start as rough category buckets?
- YouTube API quota — using an existing Forge 2 Google Cloud project or a dedicated one for this module?
- Should tracked-channel limits be tier-gated by count (e.g., Free=3, Pro=unlimited)?
