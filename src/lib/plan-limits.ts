import "server-only";

/**
 * Generalized from what was niche-finder-tiers.ts — that file only gated
 * Niche Finder; this is the same `workspace.plan` mechanism applied
 * across every module that needs a free-tier limit. One source of truth
 * for what each plan includes, rather than a magic number buried in each
 * route that enforces it.
 *
 * The billing gap this file used to flag is now closed — see
 * src/lib/platform-billing.ts and /billing. A workspace CAN move off
 * free now, via real Stripe Checkout, not just in the database by hand.
 */
export type PlanTier = "free" | "lite" | "pro";

const TIER_RANK: Record<PlanTier, number> = { free: 0, lite: 1, pro: 2 };

export function normalizeTier(plan: string): PlanTier {
  return plan === "lite" || plan === "pro" ? plan : "free";
}

export function meetsTier(plan: string, minimum: PlanTier): boolean {
  return TIER_RANK[normalizeTier(plan)] >= TIER_RANK[minimum];
}

export interface PlanLimits {
  label: string;
  priceUsdMonthly: number | null; // null = free
  teamMembers: number; // Infinity = unlimited
  scriptGenerationsPerMonth: number;
  thumbnailGenerationsPerMonth: number;
  videoUploads: number; // total active videos, not monthly — storage/transcoding cost is ongoing, not a monthly reset like a generation call is
  brandAssetStorageMB: number;
  nicheFinder: {
    browseLimit: number; // Infinity = full catalog
    filtering: boolean;
    tracking: boolean;
    mcpAccess: boolean;
  };
}

/**
 * The actual numbers. Free tier is deliberately usable, not a locked
 * demo — enough to run one real project — since a free tier nobody can
 * do anything meaningful in doesn't convert anyone. Lite and Pro numbers
 * are round guesses at "small team" and "agency" usage, not modeled
 * against real cost data (Anthropic/OpenAI/Mux/R2 usage all vary by
 * BYOK key anyway, so Forge 2's own cost exposure per workspace is
 * mostly bandwidth/storage, not inference) — revisit once there's real
 * usage data to tune against, same "heuristic, not measured" posture as
 * Niche Finder's growth score.
 */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    label: "Free",
    priceUsdMonthly: null,
    teamMembers: 3,
    scriptGenerationsPerMonth: 10,
    thumbnailGenerationsPerMonth: 10,
    videoUploads: 3,
    brandAssetStorageMB: 500,
    nicheFinder: { browseLimit: 20, filtering: false, tracking: false, mcpAccess: false },
  },
  lite: {
    label: "Lite",
    priceUsdMonthly: 19,
    teamMembers: 10,
    scriptGenerationsPerMonth: 100,
    thumbnailGenerationsPerMonth: 100,
    videoUploads: 25,
    brandAssetStorageMB: 5_000,
    nicheFinder: { browseLimit: Infinity, filtering: true, tracking: true, mcpAccess: false },
  },
  pro: {
    label: "Pro",
    priceUsdMonthly: 49,
    teamMembers: Infinity,
    scriptGenerationsPerMonth: Infinity,
    thumbnailGenerationsPerMonth: Infinity,
    videoUploads: Infinity,
    brandAssetStorageMB: 50_000,
    nicheFinder: { browseLimit: Infinity, filtering: true, tracking: true, mcpAccess: true },
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[normalizeTier(plan)];
}

/** Backward-compat alias — Niche Finder's own limit constant, sourced from the shared table now instead of its own duplicate. */
export const FREE_TIER_NICHE_LIMIT = PLAN_LIMITS.free.nicheFinder.browseLimit;
