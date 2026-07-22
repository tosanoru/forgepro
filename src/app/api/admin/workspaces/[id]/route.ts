import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { requireSuperAdmin, SuperAdminError } from "@/lib/super-admin";

const VALID_PLANS = ["free", "lite", "pro"] as const;

/**
 * PATCH /api/admin/workspaces/[id] — sets workspace.plan directly.
 *
 * This is a manual override, not a billing action: it does NOT touch
 * Stripe. Normally workspace.plan is set by /api/billing/webhook in
 * response to real subscription events (checkout.session.completed,
 * subscription updates/cancellation — see platform-billing.ts). Using
 * this to grant "pro" doesn't create or extend a Stripe subscription,
 * and using it to downgrade a workspace that has an active paid
 * subscription doesn't cancel that subscription — the next webhook event
 * (e.g. their existing subscription's renewal) will just overwrite
 * whatever was set here back to whatever Stripe says. This is meant for
 * comps, testing, and manual abuse response, not as a substitute for
 * actual billing changes.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof SuperAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  const body = await req.json();
  const { plan } = body as { plan: string };
  if (!VALID_PLANS.includes(plan as (typeof VALID_PLANS)[number])) {
    return NextResponse.json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` }, { status: 400 });
  }

  const [updated] = await db.update(workspaces).set({ plan }).where(eq(workspaces.id, id)).returning({ id: workspaces.id, plan: workspaces.plan });
  if (!updated) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  return NextResponse.json({ workspace: updated });
}
