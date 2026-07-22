# Forge 2 — Plan

Note: this repo had no `PLAN.md` before this pass — only `CLAUDE.md` (handoff
notes) and `NICHE-FINDER-SPEC.md` (the original module spec). This file is new,
built from CLAUDE.md's "Next steps" and "What's a placeholder, not finished"
sections so there's a single forward-looking doc instead of having to mine the
handoff log for what's left. Keep CLAUDE.md as the "what happened and why"
record; keep this as the "what's next, in order" record — don't let them drift
into duplicating each other.

## Priority 0 — before anything else ships

1. **Test every external integration and every bearer-token-auth route as an
   actual unauthenticated external caller**, not from inside the app. The
   middleware bug fixed this pass (cron and MCP were unreachable end-to-end
   despite correct internal auth logic) is exactly the class of bug that only
   real external calls catch. Nothing below matters if this doesn't happen
   first. Covers: Mux, R2, Stripe (platform + BYOK), Paystack, Flutterwave,
   OpenAI, the YouTube Data API, and the MCP server (all 14 tools, not just
   the original 5 — the 9 added this pass are equally untested against a real
   client).
2. **Get an actual MCP client handshake working** — Claude Desktop or Cursor
   against `/api/mcp/niche-finder`. Type-checks clean, SDK usage verified
   against shipped `.d.ts` files, but no real client has ever connected.

## Priority 1 — Niche Finder scale-up

Current state: 26 categories, daily discovery, ~5,200/10,000 YouTube quota
units/day already committed to discovery alone. NexLev (the reference product)
claims 20,000+ niches and 122M+ channels analyzed — not reachable on the
default quota tier at all.

1. **Request a YouTube Data API quota increase from Google Cloud Console.**
   This is the actual blocker for real scale, not code — 100 units/call on
   `search.list` is a hard ceiling regardless of caching or scheduling
   cleverness. This is a manual step outside Claude Code's reach; someone
   needs to file the request and it's not instant.
2. **Add a per-workspace rate limit on `search_videos_by_topic`** (101
   units/call, Pro-gated but otherwise unlimited). A single Pro workspace
   in a tight loop can still exhaust the shared daily quota today. Needs a
   small usage-counter table, similar shape to `mcpApiKeys.lastUsedAt`.
3. **Add YouTube quota monitoring/alerting.** Right now a quota exhaustion
   shows up only as entries in a cron job's `errors` array that nobody's
   watching. At minimum, log a warning once daily usage crosses some
   threshold (e.g. 80%).
4. **Paginate MCP tool responses.** `search_niches`, `get_trending_channels`,
   `search_videos_by_topic`, etc. all cap at a fixed limit with no cursor —
   fine at current data volume, won't be once discovery has been running
   for months.
5. Once real snapshot history accumulates (weeks, not days) — validate
   `growthScore` against reality and retune the heuristic weights
   (currently `0.5×sub-growth + 0.3×view/sub ratio + 0.2×upload frequency`,
   never calibrated against real outcomes).

## Priority 2 — Chrome Extension (not started)

Scoped in `NICHE-FINDER-SPEC.md` as a v2/deferred item; no code exists yet.
NexLev's own extension is 35+ tools and is arguably the bulk of their product,
not an afterthought — worth treating as a real second build, not a quick
add-on, when it's picked up. Needs: separate Manifest V3 codebase (Vite +
`@crxjs/vite-plugin`), its own auth flow (extension token, same
`mcpApiKeys`-style pattern rather than a new login), and a deliberately small
v1 tool set (2-3 highest-value tools) rather than trying to match 35+ at once.

## Priority 3 — everything else flagged as a placeholder

Roughly in the order each module was built (full detail in CLAUDE.md's "What's
a placeholder, not finished"):

- Revenue Dashboard: no auto-sync cron (manual "Sync" click only), untested
  against real Stripe/Paystack/Flutterwave accounts, no currency conversion
  across mixed-currency workspaces
- Thumbnail Generation: untested against a real OpenAI account, no
  per-request cost guardrail beyond the monthly count cap
- Plan limit numbers (`plan-limits.ts`) are reasonable guesses, not modeled
  against real Anthropic/OpenAI/Mux/R2 cost exposure per workspace

## Explicitly not planned

- Matching NexLev's channel/niche count without the Google quota increase
  above — no code path gets there on the default API tier.
- Thumbnail-analysis or sponsorship-data MCP tools — would need new paid
  third-party data sources, not just new queries against what's already
  collected. A deliberate scoping decision, not a gap to quietly fill.
