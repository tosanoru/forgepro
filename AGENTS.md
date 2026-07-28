# Forge 2 — Agent Instructions

## Project Identity
SaaS for content agencies/creators — script writing, video review & client approval, content planning (Kanban + calendar), brand asset management, revenue tracking, thumbnail generation, Niche Finder (YouTube research). Multi-workspace with recursive parent/child model.

Single Next.js App Router app (not a monorepo).

## Running Locally
```bash
npm install
cp .env.example .env.local   # populate all vars
npm run db:push               # drizzle-kit push to Neon
npm run dev
```
Lint: `npm run lint`. Type-check: `npx tsc --noEmit`. Build: `npm run build` (Turbopack).

## Architecture

### Workspace Model
Recursive self-FK (`parentWorkspaceId`). Types: `creator|agency|client|org`. Every route resolves the active workspace via `ensureWorkspace()` (server-only, `src/lib/workspace.ts`).

### Auth & Permissions
- Middleware (`middleware.ts`) wraps NextAuth — catches every path except static assets. Public route allowlist in `auth.config.ts` includes: `/login`, `/api/auth/*`, `/approve/*`, `/api/approval/*`, `/api/mux/webhook`, `/api/billing/webhook`, `/api/cron/*`, `/api/mcp/*`. Any new public route MUST be added here.
- Roles: `owner|admin|editor|reviewer|client_viewer` (ranked by `ROLE_RANK` in `workspace-types.ts`). Use `requireRole(workspaceId, userId, minimum)` from `src/lib/permissions.ts`.
- Client approval links use token-based auth (`src/lib/approval.ts`), no session.
- Active workspace via `ACTIVE_WORKSPACE_COOKIE` (httpOnly), not JWT.
- Super admin bootstraps via `SUPER_ADMIN_EMAILS` env var. Checked server-side per-request, not from JWT.

### API Routes
- Cron jobs authenticate via `Authorization: Bearer $CRON_SECRET`.
- MCP endpoints authenticate via bearer token with `withMcpAuth()` (`src/lib/mcp-auth.ts`). Keys are SHA-256 hashed, not encrypted.
- Webhook routes must NOT be behind session auth (already on public-path allowlist).
- All amounts in `revenue_entries.amountCents` use smallest currency unit. Flutterwave adapter converts on ingest (multiplies by 100).

### BYOK Key Storage
Third-party API keys encrypted per-workspace with AES-256-GCM (`src/lib/crypto.ts`). UI shows last 4 chars only. Exception: MCP API keys are SHA-256 hashed.

### Plan Limits
`free|lite|pro` in `src/lib/plan-limits.ts`. Every write route that creates billable resources calls `enforcePlanLimit()` BEFORE creation. Pending invites count against limits too.

### Data Fetching
All workspace-scoped SWR hooks live in `src/lib/` (`use-content.ts`, `use-videos.ts`, `use-scripts.ts`, `use-assets.ts`, `use-revenue.ts`, `use-thumbnails.ts`, `use-niche-finder.ts`). Keys derive from `workspace.id`. Revalidating `useWorkspace()` cascades refetch through all. `src/hooks/` only has `useAuth.ts` and `use-mobile.tsx`.

### File Uploads
- **Video Review**: Browser → Mux presigned URL. File bytes never touch server. Mux webhook (`/api/mux/webhook`) updates video row.
- **Brand Assets**: Browser → Cloudflare R2 presigned PUT. Downloads via presigned GET. Flat folder structure (string tag).
- **Thumbnails**: Server calls OpenAI gpt-image-1 (base64), uploads to R2 via `uploadObject()` (`r2.ts`). No browser-side file.

## Modules

| Route | Module | Notes |
|-------|--------|-------|
| `/content` | Content Planning | Kanban + calendar toggle. Stages: IDEA→SCRIPT→PRODUCTION→REVIEW→APPROVED→PUBLISHED |
| `/script`, `/ai-script` | AI Script Writing | BYOK AI dispatch (`src/lib/ai-provider.ts`). Two distinct prompt paths (`script-prompts.ts`). No streaming |
| `/videos`, `/approve/[token]` | Video Review | Mux direct upload + timestamped comments + approval |
| `/assets` | Brand Assets | R2-backed DAM. Allowlist: images, video, audio, fonts, PDF, Office, zip, .ai/.eps/.psd. 250MB cap |
| `/revenue` | Revenue Dashboard | Stripe/Paystack/Flutterwave adapters in `payment-providers/` table. Cron sync daily at 6am |
| `/thumbnails` | Thumbnails | OpenAI gpt-image-1 (separate BYOK key). Links to content cards (many-to-one) |
| `/niche-finder` | Niche Finder | YouTube research. 4 daily crons, MCP server with 14 tools, global shared data |
| `/team` | Team | Member list, invites, client workspace creation (for agency type) |
| `/settings/billing` | Platform Billing | Stripe Checkout (separate account from BYOK). Webhook-driven |
| `/admin` | Super Admin | Platform-wide. 4 tabs: Users, Workspaces & Plans, Niche Categories, YouTube Quota |
| `/challenges` | Challenges | Revenue milestone tracking (30-days-1k, 90-days-10k, 120-days-100k) |

## Database
- PostgreSQL on Neon, Drizzle ORM
- Schema: `src/db/schema.ts`. Client: `src/db/index.ts` (neon-http + drizzle with full schema)
- Migrations: `npm run db:generate` → `npm run db:migrate`. For dev: `npm run db:push`. Config: `drizzle.config.ts`
- Drizzle Kit studio: `npm run db:studio`

## Key Patterns & Gotchas

### `req.json()` Safety
Wrap every `await req.json()` in try/catch. Use distinct variable names (`body2`, `body3`) for multiple calls in one handler.

### Read-Then-Write Race Conditions
Use `db.transaction()`:
```ts
await db.transaction(async (tx) => {
  const [row] = await tx.select().from(table).where(eq(table.id, id)).limit(1);
  await tx.update(table).set({ value: row.value + 1 }).where(eq(table.id, id));
});
```

### Exclusive Claims (One-to-One)
Use `db.transaction()` with a fresh read inside to check no existing claim.

### Webhook Idempotency
Mux webhooks: guard against status regression. Fallback lookup by `source_upload_id`.

### Misc
- `Stripe` / `Paystack` / `Flutterwave` BYOK revenue keys are separate from Forge 2's own Stripe platform billing (`src/lib/stripe.ts` vs `src/lib/platform-billing.ts` — never import each other).
- `search_videos_by_topic` costs 101 YouTube quota units. Gated to Pro + 15 calls/workspace/day.
- No streaming on script generation (blocking, ~1500-3000 tokens).
- No currency conversion — assumes single-currency workspace.
- Niche Finder scores are heuristics. `growthScore` needs 30-day snapshots to mean anything.

## Key Files
```
src/
  app/                — App Router pages + API routes
  auth.config.ts      — Auth.js config (Edge-safe, middleware uses this)
  auth.ts             — Auth.js runtime (Node, adds providers)
  components/         — shadcn/ui + app components (AppShell, Sidebar, etc.)
  db/schema.ts        — All tables
  db/index.ts         — Drizzle client (neon-http)
  hooks/              — useAuth, use-mobile only
  lib/                — All utilities, SWR data hooks, payment adapters, crypto, etc.
```

## Environment Variables
`.env.local` requires: `DATABASE_URL`, `AUTH_SECRET`, Google OAuth credentials, `ENCRYPTION_KEY`, `MUX_TOKEN_ID`/`SECRET`/`WEBHOOK_SECRET`, `R2_*`, `CRON_SECRET`, `YOUTUBE_API_KEY`, Stripe platform billing keys + price IDs. Optional: `RESEND_API_KEY`/`FROM_EMAIL`, `ANTHROPIC_API_KEY`.

## Existing Instruction Files
- `CLAUDE.md` — detailed narrative handoff document (669 lines). Useful for deep context on build history, design decisions, and placeholder gaps.
- `PLAN.md` — project plan.
- `NICHE-FINDER-SPEC.md` — Niche Finder specification.
