import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces, users } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { createCheckoutSession } from "@/lib/platform-billing";
import type { PlanTier } from "@/lib/plan-limits";

/**
 * POST /api/billing/checkout — admin+ only, since this changes what the
 * whole workspace pays for, same bar as AI settings/payment provider
 * connections elsewhere in this app.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workspaceId, tier } = body as { workspaceId: string; tier: PlanTier };
  if (!workspaceId || (tier !== "lite" && tier !== "pro")) {
    return NextResponse.json({ error: "workspaceId and a valid tier (lite or pro) are required" }, { status: 400 });
  }

  try {
    await requireRole(workspaceId, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!workspace || !user?.email) return NextResponse.json({ error: "Workspace or user not found" }, { status: 404 });

  const origin = new URL(req.url).origin;

  try {
    const url = await createCheckoutSession({
      workspaceId,
      workspaceName: workspace.name,
      ownerEmail: user.email,
      tier,
      successUrl: `${origin}/settings/billing?checkout=success`,
      cancelUrl: `${origin}/settings/billing?checkout=cancelled`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start checkout";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
