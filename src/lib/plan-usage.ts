import "server-only";
import { and, eq, gte, count, sum } from "drizzle-orm";
import { db } from "@/db";
import { workspaceMembers, workspaceInvites, scripts, thumbnails, videos, brandAssets, workspaces, workspaceImageSettings } from "@/db/schema";
import { getPlanLimits, type PlanLimits } from "@/lib/plan-limits";
import { THUMBNAIL_COST_ESTIMATE_CENTS } from "@/lib/thumbnail-pricing";

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export interface PlanUsage {
  teamMembers: number;
  scriptGenerationsThisMonth: number;
  thumbnailGenerationsThisMonth: number;
  videoUploads: number;
  brandAssetStorageMB: number;
}

export async function getPlanUsage(workspaceId: string): Promise<PlanUsage> {
  const monthStart = startOfMonth();

  const [[members], [pendingInvites], [scriptCount], [thumbnailCount], [videoCount], [assetSize]] = await Promise.all([
    db.select({ n: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
    db.select({ n: count() }).from(workspaceInvites).where(and(eq(workspaceInvites.workspaceId, workspaceId), eq(workspaceInvites.status, "pending"))),
    db.select({ n: count() }).from(scripts).where(and(eq(scripts.workspaceId, workspaceId), gte(scripts.createdAt, monthStart))),
    db.select({ n: count() }).from(thumbnails).where(and(eq(thumbnails.workspaceId, workspaceId), gte(thumbnails.createdAt, monthStart))),
    db.select({ n: count() }).from(videos).where(eq(videos.workspaceId, workspaceId)),
    db.select({ bytes: sum(brandAssets.sizeBytes) }).from(brandAssets).where(eq(brandAssets.workspaceId, workspaceId)),
  ]);

  return {
    teamMembers: members.n + pendingInvites.n,
    scriptGenerationsThisMonth: scriptCount.n,
    thumbnailGenerationsThisMonth: thumbnailCount.n,
    videoUploads: videoCount.n,
    brandAssetStorageMB: Math.round(Number(assetSize.bytes ?? 0) / (1024 * 1024)),
  };
}

export class PlanLimitError extends Error {
  status = 403 as const;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Checks one resource against the workspace's plan and throws
 * PlanLimitError if it's already at or over the limit. Called BEFORE the
 * action that would create one more of that resource (invite, generate,
 * upload) — so the check is against "count so far", and the caller is
 * blocked from creating the (limit + 1)th one, not retroactively over
 * limit after the fact.
 */
export async function enforcePlanLimit(
  workspaceId: string,
  resource: "teamMembers" | "scriptGenerationsThisMonth" | "thumbnailGenerationsThisMonth" | "videoUploads" | "brandAssetStorageMB",
  incomingAmount = 1,
): Promise<void> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const limits: PlanLimits = getPlanLimits(workspace?.plan ?? "free");
  const usage = await getPlanUsage(workspaceId);

  const limitMap: Record<typeof resource, number> = {
    teamMembers: limits.teamMembers,
    scriptGenerationsThisMonth: limits.scriptGenerationsPerMonth,
    thumbnailGenerationsThisMonth: limits.thumbnailGenerationsPerMonth,
    videoUploads: limits.videoUploads,
    brandAssetStorageMB: limits.brandAssetStorageMB,
  };
  const limit = limitMap[resource];
  const current = usage[resource];

  if (current + incomingAmount > limit) {
    const label = RESOURCE_LABEL[resource];
    throw new PlanLimitError(
      limit === current
        ? `${label} limit reached (${limit} on the ${limits.label} plan). Upgrade in Settings → Billing to add more.`
        : `This would put you over your ${label.toLowerCase()} limit (${limit} on the ${limits.label} plan). Upgrade in Settings → Billing.`,
    );
  }
}

const RESOURCE_LABEL: Record<string, string> = {
  teamMembers: "Team members",
  scriptGenerationsThisMonth: "Monthly script generations",
  thumbnailGenerationsThisMonth: "Monthly thumbnail generations",
  videoUploads: "Video uploads",
  brandAssetStorageMB: "Brand asset storage",
};

/**
 * Separate from enforcePlanLimit's count cap on purpose: a plan's
 * thumbnail count limit and a workspace's own $ comfort level aren't the
 * same guardrail. A workspace on a generous plan might still want to cap
 * spend tighter than the plan allows; this only fires if the workspace
 * has actually set `monthlyBudgetCents` in Settings → Images (null = not
 * opted in, count cap is still the only limit — this never silently
 * blocks a workspace that never configured a budget).
 */
export class ThumbnailBudgetError extends Error {
  status = 402 as const; // Payment Required — distinct from 403's plan-limit meaning
  constructor(message: string) {
    super(message);
  }
}

export async function enforceThumbnailBudget(workspaceId: string): Promise<void> {
  const [settings] = await db
    .select({ monthlyBudgetCents: workspaceImageSettings.monthlyBudgetCents })
    .from(workspaceImageSettings)
    .where(eq(workspaceImageSettings.workspaceId, workspaceId))
    .limit(1);
  const budget = settings?.monthlyBudgetCents;
  if (budget == null) return; // no budget configured — count cap is the only guardrail

  const monthStart = startOfMonth();
  const [{ spentCents }] = await db
    .select({ spentCents: sum(thumbnails.estimatedCostCents) })
    .from(thumbnails)
    .where(and(eq(thumbnails.workspaceId, workspaceId), gte(thumbnails.createdAt, monthStart)));
  const spent = Number(spentCents ?? 0);

  if (spent + THUMBNAIL_COST_ESTIMATE_CENTS > budget) {
    throw new ThumbnailBudgetError(
      `This would put the workspace over its monthly image-generation budget ` +
        `($${(budget / 100).toFixed(2)}) — $${(spent / 100).toFixed(2)} spent so far this month ` +
        `(estimated). Raise the budget in Settings → Images, or wait until next month.`,
    );
  }
}
