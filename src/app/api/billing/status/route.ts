import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { getPlanUsage } from "@/lib/plan-usage";
import { getPlanLimits, normalizeTier, PLAN_LIMITS } from "@/lib/plan-limits";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const tier = normalizeTier(workspace?.plan ?? "free");
  const [usage, limits] = await Promise.all([getPlanUsage(workspaceId), Promise.resolve(getPlanLimits(tier))]);

  return NextResponse.json({ tier, usage, limits, allPlans: PLAN_LIMITS, hasBillingHistory: Boolean(workspace?.stripeCustomerId) });
}
