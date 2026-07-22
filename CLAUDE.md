# Forge 2 — Handoff (Real billing, calendar view, and a critical bug fix)

Every module from the original brief exists, plus Niche Finder on top. This pass
closed the tiering gap for real (Stripe Checkout, not just enforcement — see
"Platform Billing"), added Content Planning's calendar view, and cleared four
smaller items (invite emails, script version history, comment resolution, Brand
Assets file-type limits). It also found and fixed a genuinely serious bug: the auth
middleware was silently blocking every cron job and MCP call before they ever
reached their own auth logic — see "Critical fix" below, first, before anything
else in this file.

**Follow-up pass (this update):** expanded the Niche Finder MCP server from 5
tools to 14 (see "Niche Finder" → "MCP server" below for the full list and the
reasoning behind each), and widened the discovery cron from weekly/11
categories/1 keyword to daily/26 categories/2 keywords. No new tables, no new
external services — everything added builds on data the pipeline already
collects. `tsc --noEmit` verified clean after every change in this pass,
including two brace-matching mistakes caught and fixed mid-edit (see git history
on `src/app/api/mcp/niche-finder/route.ts` if that matters later — both were
caught by immediately re-running the type check, not assumed fixed).

## Critical fix — cron jobs and the MCP server were unreachable

Found while adding `/api/billing/webhook`, which needed the same "no session,
don't gate this behind login" treatment as the Mux webhook already had.

`middleware.ts`'s matcher catches every request path except static assets — that
was correct and intentional. But `auth.config.ts`'s `authorized` callback only
allowlisted `/login`, `/api/auth`, `/approve`, `/api/approval`, and
`/api/mux/webhook` as public; everything else required `isLoggedIn`. That list
never included `/api/cron/*` or `/api/mcp/*`.

Both of those already have their own auth (`CRON_SECRET` bearer token for cron,
the MCP key bearer token via `withMcpAuth`) — auth that was correctly designed
and correctly implemented. None of it mattered, because the outer middleware
redirected every unauthenticated request to `/login` before the request ever
reached the route handler that would have checked it. A cron job hitting
`/api/cron/sync-revenue` has no session cookie; neither does Claude Desktop
calling the MCP server. Both would have gotten a redirect, every single time,
since the day each was built.

This is exactly the kind of bug "verify against current docs" doesn't catch —
it's not a wrong API call, it's a wrong assumption about which layer of this
app's own auth was actually in effect. Type-checking and building don't exercise
runtime middleware behavior against an unauthenticated request either, so it
sailed through every build check across four separate passes undetected. Fixed
now (`/api/cron` and `/api/mcp` added to the public-path allowlist), but this is
the strongest possible argument in this whole document for why real end-to-end
testing — hitting these endpoints as an actual external, unauthenticated caller
— matters more than anything else left to do. A confidently-written, correctly
type-checked feature can still be completely dead on arrival.

## What's in this pass

- **Auth**: Auth.js v5, credentials + Google OAuth, Edge/Node split (`auth.config.ts`
  vs `auth.ts`) — ported verbatim from Forge, zero changes. It didn't need any.
- **Workspace model**: recursive (`parentWorkspaceId` self-FK on `workspace`) instead
  of Forge's flat single-workspace-per-user model. See `src/db/schema.ts` and
  `FORGE-2-ARCHITECTURE.md` §2.
- **Roles**: `owner|admin|editor|reviewer|client_viewer`. `client_viewer` is the seat
  an agency's client sits in — scoped to their own child workspace only.
- **Permissions**: `src/lib/permissions.ts` — `can(role, minimum)` + `requireRole()`.
  Every module's API routes should call `requireRole()` rather than hand-rolling
  checks.
- **Team UI**: `/team` — member list, invite form, and (for agency workspaces)
  client-workspace creation.
- **AI Script Writing** (`/script`, `/script/new`, `/script/[id]`): topic in, full
  draft out, editable and saveable after. Ported from Forge's
  BYOK provider engine (`src/app/api/seo/route.ts`) — same Anthropic + 5
  OpenAI-compatible-API dispatch logic, generalized into `src/lib/ai-provider.ts` so
  future modules (thumbnail prompts, SEO metadata) can call the same function instead
  of reimplementing provider dispatch.
  - **Correction from the last handoff**: Forge doesn't actually have AI script
    writing — its `/script` is fill-in-the-blank templates. Its only real AI feature
    is SEO metadata generation. The prompt in `src/app/api/scripts/route.ts` is new,
    not ported.
  - **Short-form and long-form generate from genuinely different prompts**, not the
    same prompt at different lengths (`src/lib/script-prompts.ts`). Long-form keeps
    the original hook/intro/body(with a mid-script retention beat)/mid-roll CTA/
    closing CTA structure; short-form is a single hook-to-payoff loop under 60
    seconds, deliberately without a generic "subscribe" close (that belongs in a
    caption/pinned comment for short-form, not spoken) and without b-roll bracket
    directions (assumes one continuous take). `scripts.format` stores which one ran.
    This was a known gap flagged when Content Planning was first built — cards
    already had a `format` field that Script Writing never read — closed by having
    the New Script page accept `?cardId=&format=&topic=` and the content card
    detail dialog offer a "Generate script" action that passes its own format
    straight through, auto-attaching the result back to the card in the same POST
    (no separate attach step).
- **BYOK key storage — deliberately changed from Forge, not a straight port**: Forge
  stores the API key in browser `localStorage`. That doesn't work once more than one
  person needs to generate content in a workspace. Forge 2 stores it encrypted
  (AES-256-GCM, `src/lib/crypto.ts`) server-side, scoped to the workspace — same
  shape as Keystone's credential vault. There is no "reveal" endpoint; `/settings`
  only ever shows the last 4 characters, never the full key.
- **Design system**: shadcn `ui/` components and Tailwind v4 tokens ported
  byte-for-byte from Forge, retheme'd to Syne + DM Mono, near-black/acid-yellow/
  electric-indigo, dark-by-default (`ThemeToggle.tsx`).
- **Video Review + Client Approval** (`/videos`, `/videos/[id]`, `/approve/[token]`) —
  new module, no Forge equivalent at all. Deliberately does NOT build video
  ingest/transcoding/scrubbing — that's Mux's job (`src/lib/mux.ts`). What's ours is
  thin: the `videos` row (Mux asset reference + review status), `videoComments`
  (timestamped, layered on top of Mux's player), and `approvalLinks` (the
  no-account, token-based path a client uses to review and approve — see
  `src/lib/approval.ts`, which is a completely separate auth path from
  `requireRole()`, since there's no session or workspace_member row for an
  external client).
  - Upload flow: browser requests a direct-upload URL from our API
    (`POST /api/workspace/[id]/videos`), then PUTs the file straight to Mux —
    the file bytes never touch our server. Mux's webhook
    (`/api/mux/webhook`) updates the video row as transcoding progresses.
  - `/approve/[token]` is the actual "Client Approval" surface — no sidebar, no
    account, just the video, a comment thread, and Approve / Request Changes.
  - The `client_viewer` role (from the first pass) and this token-link system are
    two different paths to the same review page — `client_viewer` is for a client
    who has a real account and logs in normally; approval links are for a client
    who doesn't and never will. Both exist because different agencies' clients
    have different expectations here — some want a login, most don't.
- **Content Planning** (`/content`) — Kanban board, ported from Forge's
  `pipelineCards`/`pipeline` page (native HTML5 drag-and-drop, no library
  dependency — Forge never used one either). Real changes from the port:
  added an IDEA stage before Forge's board started (Forge assumed every card
  began pre-scripted); dropped the SEO fields and YouTube stats columns —
  those belong to AI Script Writing and the future Revenue Dashboard
  respectively, not Content Planning, so a card links out to a `scriptId` /
  `videoId` instead of duplicating their data. Stage-move keeps Forge's
  exact "only backfill a stageDate when moving forward" rule, so dragging a
  card backward doesn't falsely claim a skipped stage was completed.
- **Brand Assets** (`/assets`) — new module, no Forge equivalent. Same
  direct-upload shape as Video Review but against Cloudflare R2
  (`src/lib/r2.ts`) instead of Mux — presigned PUT for upload, presigned GET
  for download, bucket stays private throughout. Deliberately flat: a
  `folder` string tag rather than a real nested folder tree, since most
  agencies' libraries are small enough that tag filtering beats folder
  navigation, and it's a lot less to build and get wrong. Can graduate to
  real folders later if usage justifies it.
- **Revenue Dashboard** (`/revenue`) — deliberately does NOT integrate the YouTube
  Analytics Monetary API. `yt-analytics-monetary.readonly` requires a Google CASA
  security assessment (a paid third-party audit) before Google allows production
  use — that's a compliance process outside the scope of a coding pass, not
  something worth building a half-working OAuth flow around. Forge already made
  the identical call for its stats feature (`src/lib/youtube.ts` — public Data API
  with a plain API key, not OAuth analytics).
  - What's real: **Stripe, Paystack, and Flutterwave** (`workspace_payment_settings`
    — one row per `(workspace, provider)`, not one-provider-per-workspace, so an
    agency billing some clients in USD and others in NGN can run more than one at
    once). All three are BYOK, validated against the provider's API on save. The
    dispatch is centralized in `src/lib/payment-providers.ts` — a fetch/verify
    adapter per provider (`stripe.ts`, `paystack.ts`, `flutterwave.ts`) registered
    in one table, so the API routes (`/api/workspace/[id]/revenue/[provider]/...`)
    never branch on which provider they're talking to. Adding a fourth processor
    later means writing its adapter file and adding one line to the registry, not
    touching any route.
    - **Worth knowing about the amounts**: Stripe and Paystack both return
      transaction amounts already in the smallest currency unit (cents/kobo).
      Flutterwave returns the *main* unit (₦5,000, not 500000), so
      `flutterwave.ts` is the one adapter that multiplies by 100 before it hits
      `revenue_entries.amountCents` — every row in that table assumes smallest-unit
      convention, so that's where the conversion belongs, not scattered into the
      shared schema or UI.
    - Stripe specifically syncs via balance transactions (not raw charges) so
      refunds net out correctly; Paystack/Flutterwave sync via their transaction
      list endpoints filtered to successful payments.
  - **Manual entries** (`revenue_entries`, source = `youtube_adsense` | `sponsorship`
    | `other`) — for everything that doesn't come through a payment provider. Most
    agencies already log AdSense/sponsorship income by hand; this just gives it a
    home next to the synced numbers instead of living in a separate spreadsheet.
  - One dashboard, one ledger — `revenue_entries.source` distinguishes where a row
    came from, but the chart and monthly total treat them the same.
- **Thumbnail Generation** (`/thumbnails`) — the last module. Uses OpenAI's image
  model (`gpt-image-1`) specifically, with its own dedicated BYOK key
  (`workspace_image_settings`) — deliberately separate from whatever provider
  powers AI Script Writing, since Anthropic and most of the OpenAI-compatible
  providers wired up in `ai-provider.ts` don't generate images at all. A
  workspace can run Claude for scripts and still need a separate OpenAI key here;
  that's expected, not a gap to close.
  - Generation flow differs from every other upload in this codebase: Video
    Review and Brand Assets both have the *browser* upload directly (presigned
    URL, file never touches our server). Thumbnails are the opposite — the
    server calls OpenAI, gets image bytes back, and pushes them to R2 itself
    (`uploadObject()` in `r2.ts`, a new direct-upload helper alongside the
    existing presigned ones) — there's no browser-side file to presign an
    upload for.
  - `gpt-image-1` always returns base64, no hosted-URL option (unlike
    dall-e-2/3) — which actually suits this flow, since we're re-hosting on R2
    ourselves anyway and would've had to fetch-and-reupload a temporary OpenAI
    URL for no benefit.
  - Thumbnails can link to a `contentCardId` (nullable FK on the `thumbnail`
    table) — many thumbnails to one card, unlike the exclusive one-card-each
    relationship scripts/videos have. Settable from the gallery UI now (see
    "This pass" below) — wasn't when this module was first built.
- **Active-workspace switching** — the gap that had been open since the very
  first pass. The Sidebar switcher used to list a person's workspaces but do
  nothing when one was picked, since there was no server-side concept of
  "which workspace is currently active." Fixed via `ACTIVE_WORKSPACE_COOKIE`
  (`src/lib/active-workspace.ts`): `POST /api/workspace/active` sets an
  httpOnly cookie after verifying the person is actually a member of the
  target workspace, and `GET /api/workspace` reads it, falling back to the
  original first-joined-workspace behavior if the cookie is missing or
  points at a workspace access was since revoked from. Deliberately not
  stored in the Auth.js session/JWT — switching workspaces shouldn't need to
  re-issue a session token. Every other module's data hooks (`useContentCards`,
  `useVideos`, `useScripts`, `useBrandAssets`, `useRevenue`, `useThumbnails`)
  derive their own SWR key from `workspace.id`, so revalidating the one
  `useWorkspace()` hook after a switch cascades a refetch through the whole
  app — no per-module invalidation needed.

## This pass — the three priorities from the last handoff, in order

1. **API contracts verified against current documentation.** Every third-party
   integration was checked against its actual current docs (not just assumed
   correct from training knowledge), since this sandbox can't reach any of these
   APIs to test live:
   - OpenAI images: `size: "1536x1024"` and base64-by-default for GPT image
     models — confirmed correct, no change. Worth knowing: `gpt-image-2` now
     exists as a newer option; `gpt-image-1` was kept for cost-predictability,
     but worth revisiting once you have real usage data.
   - Paystack: `meta.pageCount`/`meta.page` pagination shape — confirmed
     correct, no change.
   - Flutterwave: `meta.page_info.total_pages` pagination shape — confirmed
     correct, no change.
   - **Mux webhooks — real bug fixed.** `src/lib/mux.ts` used to call
     `verifySignature()` and `JSON.parse()` separately, giving untyped `any`
     access to `event.data` (every field read with `?.` chains and no
     compile-time check they existed). Refactored to `mux.webhooks.unwrap()` —
     Mux's own documented pattern — which verifies and parses in one typed
     call. The webhook route (`/api/mux/webhook`) now gets real type-checking
     on `event.data.id`, `event.data.asset_id`, `event.data.playback_ids`
     instead of trusting untyped JSON.
2. **Content-card linking UI built.** `contentCards.scriptId`/`videoId` and
   `thumbnails.contentCardId` existed in the schema since their respective
   passes but nothing in the UI ever set them — noted as a gap three separate
   times before this pass finally closed it. One new endpoint,
   `POST /api/content/attach`, handles scripts/videos (which should belong to
   at most one card — attaching to a new card clears whichever card
   previously held that resource, rather than allowing two cards to claim the
   same script). Thumbnails go through a plain `PATCH /api/thumbnails/[id]`
   instead, since a card can reasonably have several thumbnail options — no
   exclusivity needed there. One shared component, `AttachCardPicker.tsx`,
   renders the picker on all three detail pages (Script, Video, Thumbnail
   gallery) rather than three near-identical ones. The Content Planning card
   detail dialog also now shows "View script"/"View video" links back out,
   closing the loop from the card's side too.
3. **Revenue sync can now run on a schedule, not just manually.** Real
   Trigger.dev wiring (a job queue, worker process, retry semantics) is a
   bigger infrastructure lift than this pass covers, so the pragmatic
   middle ground: `GET /api/cron/sync-revenue`, protected by `CRON_SECRET`,
   syncs every workspace's connected Stripe/Paystack/Flutterwave in one
   pass. One workspace's expired key doesn't stop the rest of the batch —
   failures are recorded per-workspace and the loop continues. `vercel.json`
   schedules it daily at 6am if deploying to Vercel (which auto-injects
   `CRON_SECRET` as the request's Bearer token — verified against Vercel's
   current docs, not assumed); any other host can point an external
   scheduler at the same endpoint with that header set manually. The
   "Sync now" button in the UI still works too — this adds automatic sync,
   it doesn't remove the manual option.

## Super Admin (`/admin`)

Platform-wide, not workspace-scoped — a new nav item, only visible to
super admins (a fresh `/api/admin/me` check, not a JWT claim — see that
route's comment for why: a revoked admin's existing session token would
otherwise still say `true` until it expired).

**Bootstrap:** `SUPER_ADMIN_EMAILS` env var (comma-separated) grants
super admin regardless of the `users.isSuperAdmin` DB flag — solves the
chicken-and-egg problem of nobody existing to grant the *first* admin
through a dashboard that requires being one. Set it once for the founder
account(s); use the dashboard (Users tab, toggle) for everyone after
that. It also doubles as recovery if a lone admin revokes themselves by
mistake — the DB flag being off doesn't matter if their email's still in
the env var.

Four tabs:
- **Users** — search, see owned-workspace count, toggle super admin
- **Workspaces & Plans** — search, see owner/members/type, change plan
  inline. **Manual override, not a billing action** — doesn't touch
  Stripe. Setting "pro" here doesn't create a subscription; the next real
  webhook event for that workspace (e.g. its actual subscription
  renewing) can silently overwrite whatever was set here. Meant for
  comps/testing/abuse response, documented as a warning banner on the
  page itself, not a substitute for real billing changes.
- **Niche Categories** — add/deactivate/delete discovery categories and
  keywords without a redeploy (backs the discover-channels cron — see
  "Niche Finder" above)
- **YouTube Quota** — 14-day usage history against the 10,000/day budget,
  red warning past 80%. Visibility only, not alerting — nobody gets
  paged, someone has to open the page and look.

## Niche Finder (from NICHE-FINDER-SPEC.md)

A research tool, not a workspace-collaboration one — deliberately architected
differently from every other Forge 2 module because the underlying data (which
YouTube channels are growing, what a niche's competition looks like) is shared
research infrastructure, not per-tenant content.

### Data model

- `channels`, `channelSnapshots`, `niches`, `nicheChannels` — global, not
  workspace-scoped. One shared pool every workspace draws from.
- `userTrackedChannels` — workspace-scoped (deviates from the spec's bare
  `userId`), so a team's tracking list is shared like every other "things
  this team owns" list in Forge 2 (content cards, scripts, revenue entries).
  `trackedBy` records who added it, same as `createdBy` elsewhere.
- `mcpApiKeys` — user-scoped, matching the spec as written. An MCP key
  configures one person's Claude Desktop/Cursor install; that's inherently
  personal even for someone on a team, unlike a tracking list.
- IDs: text + `crypto.randomUUID()` throughout, not the spec's raw `uuid()`
  Drizzle type — matches every other table in this file.

### The pipeline (4 cron jobs, all protected by the same `CRON_SECRET`)

1. **`snapshot-channels`** (daily, 03:00 UTC) — `channels.list` for every
   discovered channel, batched 50 at a time. Confirmed against current
   YouTube docs: this costs exactly 1 quota unit per call regardless of
   batch size, so the whole pool refreshes for ~1 unit per 50 channels
   against a 10,000/day default quota. **Does NOT populate
   `uploadsLast30d`/`avgViewsLast10`** — those need a per-channel
   `videos.list`/`playlistItems.list` pass, which at scale would burn quota
   fast; left null, and `computeGrowthScore` treats null as 0 rather than
   crashing.
2. **`recompute-scores`** (daily, 06:00 UTC, after snapshot) — recalculates
   every niche's growth score (the spec's formula, implemented as-is — see
   `src/lib/niche-scoring.ts`), plus a competition score and RPM estimate
   that are **NOT specified in the spec** and are this build's own
   reasonable heuristics (documented inline, flagged as "revisit once
   there's real data" the same way the spec flags growthScore itself).
3. **`discover-channels`** (daily, 04:00 UTC — widened from weekly this pass)
   — 2 seed-keyword `search.list` calls per category across 26 categories
   (up from 11), `maxResults` at the API's max of 50. 26 × 2 × 100 units =
   5,200 units/day against the 10,000/day budget, leaving ~4,800 units of
   headroom for `snapshot-channels` (trivial at current scale — 1 unit per
   50 tracked channels) and any live MCP calls that share this quota
   project (`find_channel_by_url`, `get_channel_content_pattern`,
   `search_videos_by_topic`). Deliberately not run right up against the
   ceiling. The added categories lean into faceless/research-friendly
   niches specifically: mythology & folklore, space & astronomy,
   psychology, AI & automation, book summaries, movie & TV recaps.
4. **`prune-stale`** (monthly, 1st, 05:00 UTC) — approximates "no uploads in
   12mo" via `videoCount` staleness across ~365 days of snapshots, since
   `channels.list` has no per-video upload date to check directly. Channels
   with under a year of history are never pruned — there's no way to know
   yet, so nothing guesses. This means pruning is a no-op for roughly the
   pipeline's first year, which is expected.

All five cron schedules (these four plus the existing revenue sync) resolve to
once-per-day-or-less, which — confirmed against Vercel's current docs, not
assumed — works on the Hobby plan: Hobby raised its cap to 100 cron jobs/project
in January 2026 (up from 2), the remaining Hobby restriction is cadence
(once/day minimum), not job count.

### Tiering — closed this pass, see "Platform Billing" below

This section used to flag that nothing could move a workspace off free tier —
the spec said "plug into your existing subscription schema," which Forge 2
didn't have, since Stripe/Paystack/Flutterwave here are for a *workspace* to
bill *its clients*, not for Forge 2 to bill the workspace. That's fixed now:
see "Platform Billing" further down. `src/lib/plan-limits.ts` (renamed and
generalized from what was `niche-finder-tiers.ts` — it gates every module's
free-tier limits now, not just Niche Finder's) is still the source of truth
for what each tier includes; a real Checkout flow now sits behind it.

### MCP server (`/api/mcp/niche-finder`)

Built on `mcp-handler` — **confirmed via npm that this is the current name for
what was `@vercel/mcp-adapter`**; that package now exists only as a stub
redirect notice (empty `package.json`, no code), so this deliberately doesn't
depend on it despite older tutorials still referencing the old name. Pinned to
`@modelcontextprotocol/sdk@1.26.0` exactly, matching `mcp-handler`'s peer
dependency (which is an exact pin, not a range — installing any other SDK
version fails with ERESOLVE).

`mcp-handler` was chosen specifically because it speaks Web API
Request/Response natively, sidestepping a real architectural mismatch: the
SDK's own `StreamableHTTPServerTransport` is built around raw Node
`IncomingMessage`/`ServerResponse`, which Next.js App Router route handlers
don't expose directly. Hand-rolling that bridge would have been fragile;
`mcp-handler` exists to solve exactly this problem.

Auth is bearer-token (`Authorization: Bearer fmcp_...`), verified via
`src/lib/mcp-auth.ts` — **hashed (SHA-256), not encrypted**, unlike every
BYOK key elsewhere in this schema. That's deliberate: an MCP key is a
credential *Forge 2 issues*, not a third party's secret being stored on the
user's behalf, so there's nothing to decrypt back — a hash is the right
primitive for "verify a presented key," not AES.

Fourteen tools registered, up from five this pass:

- Original five: `search_niches`, `get_niche_details`, `get_channel_stats`,
  `track_channel`, `list_tracked_channels`.
- **`untrack_channel`** — the missing counterpart to `track_channel`.
- **`find_channel_by_url`** — resolves a pasted YouTube URL, `@handle`, or
  raw channel ID into a Forge 2 channel record, checking the DB first and
  falling back to a live 1-unit YouTube lookup (auto-inserting the channel
  if new). This is the tool that makes the other thirteen usable from an
  MCP client in practice — nothing else here works without a `channelId`,
  and no MCP client ever has one until this resolves it.
- **`compare_channels`**, **`get_trending_channels`**, **`estimate_rpm`**,
  **`get_niche_history`**, **`get_channel_content_pattern`**,
  **`list_niche_categories`** — all built from existing schema/pipeline
  data, no new tables or external services. `get_niche_history` and
  `get_trending_channels` both return an explicit "not enough snapshot
  history yet" note rather than silently returning an empty/misleading
  result when the pipeline hasn't been running long enough.
- **`search_videos_by_topic`** — the one genuinely expensive addition:
  `search.list` + `videos.list` = 101 quota units/call, ~10x anything
  else here. **Hard-gated to Pro plans**, not just degraded like
  `search_niches` is for free tier — a free-tier caller looping this
  could exhaust the entire daily 10,000-unit budget in under 100 calls
  and starve the snapshot/discovery crons for every workspace. **Known
  gap: there is still no per-workspace rate limit on top of that tier
  gate** — a single Pro workspace calling this in a tight loop could
  still burn the shared daily quota. Worth a real rate-limit table
  (keyed on `mcpApiKeys`, similar shape to `lastUsedAt`) if usage ever
  looks like it's approaching that.

Each resolves the caller's *default* workspace (`ensureWorkspace()`, same fallback used
before `ACTIVE_WORKSPACE_COOKIE` existed) since an MCP call has no browser
session and therefore no active-workspace cookie to read — an MCP key isn't
workspace-scoped, so "the user's default workspace" is the most specific
answer available without adding a workspace-selection concept to the
protocol itself.

**This has not been tested against a real MCP client** (Claude Desktop,
Cursor) — same caveat as every other external integration in this codebase,
compounded here by MCP being the newest/least-familiar protocol involved.
Type-checks clean, `mcp-handler`'s API was verified against its actual
shipped `.d.ts` files (not just docs/tutorials, several of which still
reference the old `@vercel/mcp-adapter` name), but an actual client
handshake has never been exercised.

## Platform Billing (`/settings/billing`)

Real Stripe Checkout for Forge 2's own subscription — completely separate Stripe
account/integration from the BYOK Stripe key a workspace connects under Revenue
to bill its own clients. `src/lib/platform-billing.ts` and `src/lib/stripe.ts`
should never import from each other; if they ever need to, that's a sign the
separation broke.

- **`workspace.stripeCustomerId`** — new column, Forge 2's own Stripe customer
  id for that workspace's subscription. Created lazily on first checkout.
- **Checkout** (`/api/billing/checkout`) — admin+ only, creates/reuses the
  customer, starts a subscription-mode Checkout session for Lite or Pro.
- **Webhook** (`/api/billing/webhook`) — the actual source of truth.
  `checkout.session.completed` sets the plan on first subscribe;
  `customer.subscription.updated` handles upgrade/downgrade via the billing
  portal (not just Checkout) by re-deriving the tier from whatever price the
  subscription is now on; `customer.subscription.deleted` reverts to free.
  This is the only webhook-driven integration in the whole app — everything
  else (Mux aside) is poll/sync-based.
- **Billing portal** (`/api/billing/portal`) — Stripe's own self-serve
  manage/cancel page, requires the workspace to have already checked out once.
- **`src/lib/plan-limits.ts`** (renamed/generalized from `niche-finder-tiers.ts`)
  — one table of what free/lite/pro include, covering every module now: team
  members, monthly script/thumbnail generations, video upload count, brand
  asset storage, and Niche Finder's browse/filter/tracking/MCP gates. The
  actual numbers (10 scripts/month on free, etc.) are **round guesses**, not
  modeled against real cost data — same "revisit once there's usage to tune
  against" posture as Niche Finder's growth score formula.
- **`src/lib/plan-usage.ts`** — computes current usage (mostly `COUNT`/`SUM`
  queries at request time, no separate counters table) and
  `enforcePlanLimit()`, which every write route that should be gated calls
  BEFORE creating the thing that would push a workspace over its limit: team
  invites, script generation, thumbnail generation, video upload creation,
  brand asset upload. A pending (unclaimed) team invite counts against the
  limit too, not just accepted ones — the alternative was enforcing the limit
  at `ensureWorkspace()` (login time), which would mean rejecting someone
  mid-signup because a workspace they were invited to filled up after the
  invite went out. Reserving the seat at invite time is the less bad failure
  mode.
- **Untested against a real Stripe account or a real webhook delivery** — same
  caveat as every other external integration in this app, and arguably the
  highest-stakes one to get right before trusting it, since it's the thing
  that actually charges people.

## Other fixes this pass

- **Content Planning calendar view** (`src/components/ContentCalendarView.tsx`)
  — the board existed, the calendar half of "Notion-style content planning"
  didn't. A toggle on `/content` switches between them; both share the same
  card-detail dialog. Deliberately reuses the `dueDate` column that's existed
  since the first Content Planning pass rather than adding a second date
  concept to keep in sync.
- **Invite emails** (`src/lib/invite-email.ts`, via Resend) — closes a gap
  flagged since the very first Team pass. Silent no-op if `RESEND_API_KEY`/
  `RESEND_FROM_EMAIL` aren't set, and fire-and-forget even when they are (a
  failed send doesn't fail the invite itself — the pending-invite row is what
  actually matters, the email is a courtesy on top of it).
- **Script version history** (`script_versions` table) — the previous content
  is snapshotted right before an edit overwrites it, not on some other
  schedule, so "restore" always means "what it said immediately before this
  change." Restoring is itself non-destructive — it snapshots whatever was
  current before replacing it, so nothing is ever truly lost. Title/status-only
  edits don't create a version row, only actual content changes do.
- **Comment resolution in Video Review** — the `resolved` column existed since
  Video Review was first built; nothing set it. Team members (reviewer+) can
  now toggle it; deliberately NOT exposed on the client-facing approval-link
  comment path — resolving a comment is the team's call, not the client's.
- **Brand Assets file-type + size limits** — allowlist (images, video, audio,
  fonts, PDF, Office docs, zip, `.ai`/`.eps`/`.psd`), not a denylist — safer
  default for a DAM that's supposed to accept whatever an agency uploads.
  250MB per-file cap. Excludes executables/scripts on purpose; nothing in a
  brand asset library should ever need to be one.

## What's a placeholder, not finished

- **No streaming** on script generation — it's a single blocking request/response.
  Given script drafts run ~1500-3000 tokens, worth switching to a streamed response
  before this feels acceptable in a real product; right now the UI just shows a
  spinner for however long the provider takes.
- **No way to revoke or expire an approval link from the UI** — `approvalLinks`
  has `revoked` and `expiresAt` columns but no route/button sets them yet, only
  the DB default (`revoked: false`, no expiry unless `expiresInDays` was passed
  at creation).
- **Approval-link comments have no spam/abuse protection** — anyone with the
  link (which is an unguessable UUID, but still) can post unlimited comments
  under any guest name they type. Fine for now, worth a rate limit before this
  is customer-facing.
- **Mux webhook has no dedupe/idempotency handling** — if Mux retries a webhook
  delivery (which it does on non-2xx responses), the same update just runs
  twice harmlessly, but there's no explicit guard against out-of-order delivery
  (e.g. `asset.errored` arriving after `asset.ready` for some edge case).
- **This entire module is untested against a real Mux account** — built and
  type-checked in this environment, but the sandbox's network doesn't reach
  api.mux.com, so no direct upload, webhook delivery, or playback has actually
  been exercised end-to-end. Test this first before relying on it.
- **Brand Assets is untested against real R2 credentials** — same caveat as
  Mux: type-checks and builds clean, but no actual upload/download has been
  exercised against a real bucket in this environment.
- ~~Stripe sync is manual, not scheduled.~~ **Corrected — this was stale.**
  `/api/cron/sync-revenue` already exists and is already wired into
  `vercel.json` at `0 6 * * *` (daily), syncing every workspace with a
  connected payment provider. This doc previously claimed otherwise; it
  didn't match the code. The manual "Sync now" button still exists
  alongside it as an on-demand supplement, which is the right design —
  cron for automatic freshness, button for "I need this right now."
- **Revenue Dashboard is untested against a real Stripe account** — same
  caveat as Mux/R2: type-checks and builds clean, but no actual API key has
  been validated or synced against in this environment.
- **No currency conversion.** If a workspace has both USD Stripe transactions
  and, say, NGN Paystack/manual entries, they'd sum together in the "This
  month" total without conversion — currently assumes single-currency use
  per workspace, or at least that mixed-currency totals are read as
  directional, not exact.
- **Revenue Dashboard is untested against real Stripe, Paystack, or
  Flutterwave accounts** — same caveat as Mux/R2: type-checks and builds
  clean, but no actual API key has been validated or synced against in this
  environment. Paystack/Flutterwave especially — their APIs were implemented
  from public documentation, not verified against a live account, so treat
  the exact response shapes (`json.meta.pageCount` for Paystack,
  `json.meta.page_info.total_pages` for Flutterwave) as the first thing to
  confirm once real keys are available.
- **Thumbnail Generation is untested against a real OpenAI account** — same
  caveat again. `gpt-image-1`'s exact size options and response shape should
  be double-checked against OpenAI's current docs before relying on this.
- **No cost guardrails on thumbnail generation beyond the monthly count limit.**
  The plan limit (10/mo free, 100/mo lite, unlimited pro) caps total generations,
  but there's still no per-request confirmation or budget alert — someone on
  Pro could burn through real OpenAI spend with no warning before the bill
  arrives. The count limit protects Forge 2's exposure on lower tiers; it
  doesn't protect an unlimited-tier workspace's own OpenAI bill.
- ~~Niche Finder's discovery categories are a fixed, hardcoded list.~~
  **Fixed.** Categories/keywords now live in the `nicheDiscoveryCategories`
  table, editable at `/admin` → Niche Categories — add, deactivate, or
  delete without a redeploy. The cron self-seeds the original 26 defaults
  on first run if the table is empty. Max 5 keywords/category enforced
  server-side (each one is 100 quota units/day).
- ~~`search_videos_by_topic` has no per-workspace rate limit.~~ **Fixed.**
  Hard cap of 15 calls/workspace/day (`mcpToolUsage` table), on top of
  the existing Pro-tier gate — resets at midnight UTC, error message
  states the reset time and why the limit exists.
- ~~No YouTube quota monitoring or alerting.~~ **Fixed, partially.**
  Every real YouTube API call now records its actual unit cost to
  `youtubeQuotaLog` (one row/day, atomic increment). Visible at `/admin`
  → YouTube Quota with a 14-day history and a red warning past 80% of the
  10,000/day budget. This is visibility, not alerting — nobody gets
  paged or emailed, someone still has to open the dashboard and look.
  A real alert (email/Slack once a threshold's crossed) is still open.
- ~~MCP tool responses aren't paginated.~~ **Fixed for the DB-backed
  tools** — `search_niches`, `get_trending_channels`, and
  `get_niche_details` all take an `offset` param now (free tier on
  `search_niches` still ignores it, same as it ignores other filters —
  it's a fixed top-20). **Deliberately not fixed for
  `search_videos_by_topic`** — that one hits YouTube's `search.list` live
  on every call, so "another page" means another 100+-unit API call
  against a tool already capped at 15 calls/workspace/day. Paginating it
  would mean burning through that daily limit just to page through one
  query's results. Narrower queries are the right answer there, not
  pagination — documented in the tool's own MCP description so an LLM
  calling it sees the same reasoning.

## Next steps

1. **Test every external integration and every bearer-token-auth route as an
   actual unauthenticated external caller, not just via `curl` from inside the
   app.** This is more urgent than it was before this pass — the middleware
   bug above means cron and MCP were never reachable at all, and that's
   exactly the class of bug that only shows up when something outside the
   app makes the request. Mux, R2, Stripe (both platform and BYOK), Paystack,
   Flutterwave, OpenAI, the YouTube Data API, and the MCP server have all
   been built, type-checked, and verified against current documentation —
   none of it has talked to a real service from outside this environment.
2. **Let the Niche Finder pipeline run for a couple of weeks before trusting
   its scores.** `growthScore` needs real 30-day snapshot deltas to mean
   anything; `recompute-scores` handles missing history gracefully (treats
   it as zero growth) but that's a "don't crash" fallback, not a useful
   number. Same logic applies to `prune-stale`, which does nothing for the
   first year by design.
3. **Tune the plan limit numbers once there's real usage data.** Every
   number in `plan-limits.ts` (10 scripts/month on free, $19/$49 pricing,
   etc.) is a reasonable guess, not modeled against actual Anthropic/OpenAI/
   Mux/R2 cost exposure per workspace.
4. Everything else in the gaps lists above — streaming generation, approval
   link revocation, currency conversion in Revenue, quota monitoring and
   category curation for Niche Finder — roughly in the order each module
   was built.

## Running locally

```bash
npm install
cp .env.example .env.local   # DATABASE_URL, AUTH_SECRET, Google OAuth, ENCRYPTION_KEY,
                              # MUX_TOKEN_ID/SECRET/WEBHOOK_SECRET, R2_* credentials,
                              # CRON_SECRET (revenue sync + Niche Finder pipeline),
                              # YOUTUBE_API_KEY (Niche Finder), STRIPE_SECRET_KEY /
                              # STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_ID_LITE /
                              # STRIPE_PRICE_ID_PRO (Forge 2's OWN platform billing —
                              # a different Stripe account than any BYOK key),
                              # optionally RESEND_API_KEY/RESEND_FROM_EMAIL (invite
                              # emails) and ANTHROPIC_API_KEY (Stripe/Paystack/
                              # Flutterwave/OpenAI-for-images are all BYOK, connected
                              # per-workspace in-app, not env vars)
npm run db:push              # push schema to Neon
npm run dev
```

For Mux webhooks locally, use a tunnel (ngrok or similar) pointed at
`/api/mux/webhook` — Mux can't reach `localhost` directly. Same for
`/api/billing/webhook` (Stripe) and any `/api/cron/*` route — a tunnel plus a
manual curl with the `Authorization: Bearer $CRON_SECRET` header works fine for
cron testing before deploying (where `vercel.json` schedules all five
automatically, if deploying to Vercel — confirmed Hobby-plan compatible, see
"Niche Finder" above).

For the MCP server, a workspace needs to be on Pro first — either through a
real Checkout flow now that platform billing exists (`/settings/billing`,
using Stripe's test mode and test card numbers), or by manually setting
`workspace.plan = 'pro'` in the database for faster local iteration. Generate a
key from `/niche-finder/mcp`, then point Claude Desktop or Cursor's MCP config
at `http://localhost:3000/api/mcp/niche-finder` using `mcp-remote` (config
snippet is generated on that page).

Build was verified in-container (`next build`, Turbopack) — clean, no type errors,
all 72 routes compile. One stray duplicate route was found and removed during this
pass: `/api/comments/[id]` was a functional copy of
`/api/videos/[id]/comments/[commentId]` at an inconsistent flat URL, left over from
an earlier partial edit — same auth logic, just dead code and a confusing second
path to the same action. Deleted; the nested-resource version under `/api/videos/`
is the only one now, consistent with every other resource in this app. The only
build failure seen here was Google Fonts being unreachable from this sandbox's restricted network; that won't happen in your own
dev environment. Mux, R2, Stripe (both platform and BYOK), Paystack, Flutterwave,
OpenAI, the YouTube Data API, Resend, and the MCP server have NOT been exercised
against real credentials or a real client in this environment — their API
contracts were verified against current documentation and actual shipped type
definitions instead, which is the strongest check possible without live access.
Real credential and real-client testing is still the single highest-priority next
step — see the middleware bug at the top of this doc for exactly why that matters
more than it might seem.

