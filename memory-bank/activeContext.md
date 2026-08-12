# Active Context

## Current Work Focus

Forge 2 — SaaS for content agencies/creators. Single Next.js App Router app (Next 16.2.10), Neon Postgres + Drizzle, Auth.js (credentials-only: email + password via bcrypt, JWT sessions — no OAuth). Deployed to Vercel production at https://forge-rust-nine.vercel.app.

Latest delivered work: Academy module (courses, lessons, progress, badges, admin access panel, team-progress view) and dashboard module-card alignment fix.

## Recent Changes

- Academy module shipped: `/academy`, `/academy/[slug]`, `/settings/academy` (admin access), `/settings/academy/team-progress`, `/api/academy/*`, `/api/workspaces/:wsId/academy/*`. Courses are global (no workspaceId); scoping via `courseAccess.workspaceId`.
- Dashboard module-card padding/height fix: `Link className="flex"` > `Card h-full w-full` > `CardHeader pb-5` in `src/app/page.tsx`.
- `SUPER_ADMIN_EMAILS` env var added to Vercel Production; redeployed.
- Legacy `memory-bank-mcp` removed from global opencode config (`~/.config/opencode/opencode.jsonc`) — it was auto-logging `.next` build artifacts into this file. This file is now hand-maintained.

## Next Steps

- Browser smoke-test production (revoke access flow, team-progress admin/non-admin gating, module-card alignment).
- `npm run lint` is broken repo-wide (pre-existing ESLint 9 FlatCompat circular-structure crash) — not a regression, but worth fixing eventually.
- Memory-bank `projectbrief.md`, `productContext.md`, `systemPatterns.md`, `techContext.md`, `progress.md` are still template placeholders.

## Environment

- DB: Neon (Postgres). Migrations: `npm run db:push` / `db:generate` / `db:migrate`.
- Vercel: project `tosan-oru-s-projects/forge`, not linked to GitHub auto-deploy — deploy with `npx vercel --prod --yes`.
- Verification gates: `npx tsc --noEmit` and `npm run build` pass.
- Super admin: `isSuperAdmin()` = DB flag OR `SUPER_ADMIN_EMAILS` (both set).
