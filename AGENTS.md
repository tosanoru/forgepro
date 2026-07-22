# Forge 2 — Agent Instructions

## Project Identity
Forge 2 is a SaaS platform for content agencies and creators. Think Notion + Frame.io + an agency dashboard — script writing, video review & client approval, content planning (Kanban board + calendar), brand asset management, revenue tracking, thumbnail generation, and Niche Finder (YouTube research). Multi-workspace with recursive parent/child model for agency+client relationships.

Not a monorepo — single Next.js App Router application.

## Tech Stack
- **Runtime**: Next.js 14+ (App Router), TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui, Syne + DM Mono, dark-by-default, acid-yellow/electric-indigo
- **Auth**: Auth.js v5, credentials + Google OAuth, Edge/Node split (`auth.config.ts` vs `auth.ts`)
- **Database**: PostgreSQL (Neon), Drizzle ORM
- **Media**: Mux (video ingest/transcoding/playback), Cloudflare R2 (brand assets, thumbnails)
- **Payments**: Stripe (platform billing), Stripe/Paystack/Flutterwave (BYOK per-workspace revenue)
- **AI**: Anthropic (scripts), OpenAI gpt-image-1 (thumbnails), YouTube Data API (Niche Finder)
- **MCP**: `mcp-handler` (not `@vercel/mcp-adapter`), `@modelcontextprotocol/sdk@1.26.0`

## Architecture & Patterns

### Workspace Model
Recursive self-FK (`parentWorkspaceId` on `workspace`). Types: `creator|agency|client|org`. Every route must call `ensureWorkspace()` to resolve the active workspace and verify membership.

### Auth & Permissions
- Auth middleware (`middleware.ts`) is aggressive — catches every path except static assets. Public paths are allowlisted in `auth.config.ts`. `/api/cron/*` and `/api/mcp/*` must be on that allowlist too.
- Roles: `owner|admin|editor|reviewer|client_viewer`. Ranked by `ROLE_RANK` in `workspace-types.ts`.
- Permission checks: use `requireRole(workspaceId, userId, minimum)` from `src/lib/permissions.ts`. Do NOT hand-roll checks in individual route handlers.
- Client approval links use a separate token-based auth path (`src/lib/approval.ts`), no session required.
- Active workspace is tracked via `ACTIVE_WORKSPACE_COOKIE` (httpOnly), not JWT. Switching workspace cascades refetch through the whole app via SWR.

### API Routes
- Every API route handler should call `requireRole()` or `withMcpAuth()` for MCP endpoints.
- Cron jobs authenticate via `Authorization: Bearer $CRON_SECRET`.
- Webhook routes (`/api/mux/webhook`, `/api/billing/webhook`) must NOT be behind session auth.
- All amounts in `revenue_entries.amountCents` use smallest currency unit (cents/kobo). Flutterwave adapter converts on ingest.

### BYOK Key Storage
Third-party API keys (Stripe, Paystack, Flutterwave, Anthropic, OpenAI for images) are stored per-workspace, encrypted with AES-256-GCM (`src/lib/crypto.ts`). No "reveal" endpoint — settings UI shows only last 4 characters.

Exception: MCP API keys are hashed (SHA-256), not encrypted — Forge 2 issues these itself, there's nothing to decrypt back.

### Plan Limits
Gate in `src/lib/plan-limits.ts` (`free|lite|pro`). Every write route that creates billable resources calls `enforcePlanLimit()` BEFORE creating the resource. Pending invites count against the limit too, not just accepted members.

### Data Fetching
All workspace-scoped data hooks (`useContentCards`, `useVideos`, `useScripts`, `useBrandAssets`, `useRevenue`, `useThumbnails`) derive SWR keys from `workspace.id`. No per-module invalidation needed when switching workspaces — one `useWorkspace()` revalidation cascades through everything.

### File Uploads
- **Video Review**: Browser uploads directly to Mux via presigned URL (file bytes never touch the server). Mux webhook updates the video row.
- **Brand Assets**: Browser uploads directly to Cloudflare R2 via presigned PUT. Downloads via presigned GET. Flat folder structure (string tag, not nested folders).
- **Thumbnails**: Server calls OpenAI gpt-image-1 (always returns base64), uploads to R2 via `uploadObject()` in `r2.ts`. No browser-side file.

## Modules

### Content Planning (`/content`)
Kanban board + calendar toggle. Stages: IDEA → SCRIPT → PRODUCTION → REVIEW → APPROVED → PUBLISHED. Cards can link to a script (`scriptId`) and/or video (`videoId`). Calendar view reuses `dueDate` column. Same card-detail dialog for both views.

### AI Script Writing (`/script/**`)
BYOK AI provider dispatch (Anthropic + 5 OpenAI-compatible) via `src/lib/ai-provider.ts`. Script prompts in `src/lib/script-prompts.ts` — genuinely different prompts for short-form vs long-form, not same prompt at different lengths. Short-form: single hook-to-payoff loop <60s, no b-roll brackets. No streaming yet.

### Video Review (`/videos/**`, `/approve/[token]`)
Mux direct upload + timestamped comments + approval workflow. Approval links are token-based (no account needed). `client_viewer` role is for clients who log in normally; approval links are for those who don't.

### Brand Assets (`/assets`)
R2-backed DAM. File-type allowlist (images, video, audio, fonts, PDF, Office, zip, .ai/.eps/.psd), not denylist. 250MB per-file cap. No executables/scripts.

### Revenue Dashboard (`/revenue`)
Three payment provider adapters in `src/lib/payment-providers/` registered in a table, not branched on in routes. Sync via `/api/cron/sync-revenue` (daily at 6am) or manual "Sync now" button. Manual entries for AdSense/sponsorship/other. No currency conversion yet — assumes single-currency workspace.

### Thumbnails (`/thumbnails`)
OpenAI gpt-image-1 specifically (separate BYOK key from script-writing provider). Server generates → uploads to R2. Thumbnails link to content cards via nullable FK (many-to-one, unlike exclusive script/video relationship).

### Niche Finder
YouTube research tool. Global data (channels, snapshots, niches) shared across all workspaces. Pipeline: 4 cron jobs (snapshot-channels, recompute-scores, discover-channels, prune-stale). MCP server with 14 tools, Pro-tier gate on `search_videos_by_topic`. Per-workspace rate limit (15 calls/day on `mcpToolUsage` table). YouTube quota monitoring at `/admin` → YouTube Quota.

### Platform Billing (`/settings/billing`)
Stripe Checkout for Forge 2's own subscription (completely separate Stripe account from BYOK revenue keys). Webhook-driven (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`). Created lazily on first checkout.

### Super Admin (`/admin`)
Platform-wide, not workspace-scoped. Bootstrap via `SUPER_ADMIN_EMAILS` env var. Four tabs: Users, Workspaces & Plans, Niche Categories, YouTube Quota.

## Key Files & Structure
```
src/
  app/              — Next.js App Router pages + API routes
  auth.config.ts    — Auth.js config (Edge-safe)
  auth.ts           — Auth.js runtime (Node)
  components/       — React components (shadcn/ui + app-specific)
  db/schema.ts      — Drizzle schema (all tables)
  hooks/            — SWR data hooks
  lib/              — Shared utilities (permissions, AI providers, payment adapters, crypto, etc.)
```

## Critical Gotchas
- **Middleware blocks everything by default** — if a route doesn't need a session cookie, it MUST be in the public-path allowlist in `auth.config.ts`. Cron jobs and MCP calls were unreachable for multiple passes because this was missed.
- **Flutterwave returns amounts in main units**, not smallest units — `flutterwave.ts` multiplies by 100 before storing in `amountCents`.
- **`search_videos_by_topic` is expensive** — 101 quota units/call. Hard-gated to Pro + 15 calls/workspace/day rate limit.
- **Niche Finder scores are heuristics**, not measured — `growthScore` needs 30-day snapshots to mean anything. `prune-stale` is a no-op for the first year.
- **No streaming on script generation** — blocking request/response, ~1500-3000 tokens.
- **No dedupe/idempotency on Mux webhooks** — retries execute harmlessly but could arrive out of order.
- **No spam protection on approval-link comments** — anyone with the UUID guest URL can post unlimited comments.

## Running Locally
```bash
npm install
npm run db:push   # push schema to Neon
npm run dev
```
Webhooks need a tunnel (ngrok) pointed at the endpoint. Cron jobs need `Authorization: Bearer $CRON_SECRET` header. MCP server needs workspace on Pro tier + key generated from `/niche-finder/mcp`.

Build: `next build` (Turbopack). Lint: `npm run lint`. Type-check: `npx tsc --noEmit`.

## Production Bugfix Conventions

### `req.json()` Safety
Every `await req.json()` call in API route handlers MUST be wrapped in a try/catch to avoid 500 errors on malformed JSON:
```ts
let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
```
Use a different variable name (`body2`, `body3`) if a handler has multiple `req.json()` calls.

### Read-Then-Write Race Conditions
When reading a value, modifying it, and writing it back, wrap in `db.transaction()`:
```ts
await db.transaction(async (tx) => {
  const [row] = await tx.select().from(table).where(eq(table.id, id)).limit(1);
  await tx.update(table).set({ value: row.value + 1 }).where(eq(table.id, id));
});
```

### Exclusive Claims (One-to-One)
When a resource can only be claimed by one other resource (e.g. a content card can only be linked to one script), use `db.transaction()` with a fresh read inside:
```ts
await db.transaction(async (tx) => {
  const [existing] = await tx.select().from(table).where(eq(table.claimId, targetId)).limit(1);
  if (existing) throw new Error("Already claimed");
  await tx.update(table).set({ claimId: targetId }).where(eq(table.id, id));
});
```

### Webhook Idempotency
- Mux webhooks: guard against status regression (e.g. ignore `video.upload.cancelled` if asset already exists). Fallback lookup by `source_upload_id` for out-of-order events.
- All webhook routes MUST be in the public-path allowlist in `auth.config.ts`.

## Environment Variables (`.env.local`)
`DATABASE_URL`, `AUTH_SECRET`, Google OAuth credentials, `ENCRYPTION_KEY`, `MUX_TOKEN_ID`/`SECRET`/`WEBHOOK_SECRET`, `R2_*`, `CRON_SECRET`, `YOUTUBE_API_KEY`, Stripe platform billing keys + price IDs, optionally `RESEND_API_KEY`/`FROM_EMAIL` and `ANTHROPIC_API_KEY`.
