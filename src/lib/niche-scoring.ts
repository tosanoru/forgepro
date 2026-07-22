import "server-only";

/**
 * Growth score — the spec's formula, implemented as-is:
 *   growthScore = normalize(
 *     (subs_now - subs_30d_ago) / subs_30d_ago * 0.5 +
 *     (avgViewsLast10 / subscriberCount) * 0.3 +
 *     (uploadsLast30d / 30) * 0.2
 *   )
 *
 * This is a heuristic, not a validated model — the spec calls it that
 * explicitly, and it's worth taking that at face value rather than
 * treating the 0.5/0.3/0.2 weights as tuned. There's no real snapshot
 * history yet (see CLAUDE.md build-phase note: "get the daily pipeline
 * running for a week before building UI"), so there's nothing to
 * calibrate these weights against yet. Revisit once a few weeks of real
 * `channel_snapshot` deltas exist.
 */
export function computeGrowthScore(params: {
  subsNow: number;
  subs30dAgo: number | null; // null if no snapshot exists from ~30 days ago yet
  avgViewsLast10: number | null;
  subscriberCount: number;
  uploadsLast30d: number | null;
}): number {
  const { subsNow, subs30dAgo, avgViewsLast10, subscriberCount, uploadsLast30d } = params;

  const subGrowthRate = subs30dAgo && subs30dAgo > 0 ? (subsNow - subs30dAgo) / subs30dAgo : 0;
  const viewToSubRatio = subscriberCount > 0 ? (avgViewsLast10 ?? 0) / subscriberCount : 0;
  const uploadFrequency = (uploadsLast30d ?? 0) / 30;

  // Clamp each component before weighting — an unbounded ratio (e.g. a
  // brand-new channel with 10 subs and 50k avg views) would otherwise
  // blow the composite past any sane 0-100 range.
  const clampedGrowth = clamp(subGrowthRate, -1, 2); // -100% to +200% monthly
  const clampedViewRatio = clamp(viewToSubRatio, 0, 3); // views-per-video up to 3x sub count
  const clampedUploadFreq = clamp(uploadFrequency, 0, 2); // up to 2 uploads/day

  const raw = clampedGrowth * 0.5 + clampedViewRatio * 0.3 + clampedUploadFreq * 0.2;

  // raw's theoretical range is roughly -0.5 to 2.0 given the clamps above;
  // map that onto 0-100.
  const normalized = ((raw + 0.5) / 2.5) * 100;
  return Math.round(clamp(normalized, 0, 100));
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * RPM estimate — category-based lookup, NOT derived from any real CPM
 * dataset. The spec flags this as an open question ("do you have a CPM
 * dataset, or should this start as rough category buckets") and this
 * implements the fallback: rough, publicly-known-ballpark buckets by
 * category, wide ranges on purpose because these are genuinely rough.
 * Every UI surface showing this MUST carry a visible "estimate, not fact"
 * disclaimer — see the niche detail page — same posture the spec asks
 * for ("same disclaimer language NexLev uses").
 */
const RPM_BUCKETS_USD: Record<string, [number, number]> = {
  finance: [15, 45],
  business: [10, 30],
  technology: [8, 22],
  "real estate": [10, 28],
  education: [6, 18],
  "health & fitness": [5, 16],
  gaming: [2, 8],
  entertainment: [2, 7],
  "true crime": [4, 12],
  motivation: [3, 10],
  "faceless facts / lists": [3, 9],
  default: [2, 10],
};

export function estimateRpmRange(category: string): { low: number; high: number } {
  const key = category.toLowerCase().trim();
  const [low, high] = RPM_BUCKETS_USD[key] ?? RPM_BUCKETS_USD.default;
  return { low, high };
}
