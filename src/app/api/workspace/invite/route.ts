import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, workspaceMembers, workspaceInvites, workspaces } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { enforcePlanLimit, PlanLimitError } from "@/lib/plan-usage";
import { sendInviteEmail } from "@/lib/invite-email";
import type { WorkspaceRole } from "@/lib/workspace-types";

const INVITABLE_ROLES: WorkspaceRole[] = ["admin", "editor", "reviewer", "client_viewer"];

/**
 * POST /api/workspace/invite — same shape as Forge's invite route:
 * existing users are added immediately, unknown emails get a pending
 * invite that's claimed on next sign-up/sign-in (see ensureWorkspace).
 *
 * Difference from Forge: minimum role to invite is "admin" (not
 * owner-or-admin hardcoded), via requireRole, and the invited role can be
 * any of the five roles — critically including client_viewer, which is how
 * an agency shares a client-approval seat.
 *
 * The team-member plan limit is checked HERE, for both paths — including
 * a pending invite that hasn't been claimed yet. That's a deliberate
 * choice: the alternative is enforcing it at ensureWorkspace() (the
 * actual join point, during login), which would mean rejecting someone
 * mid-signup because a workspace they were invited to is now full — a
 * much worse failure mode than the invite just not going out in the
 * first place. So a pending invite counts as a reserved seat.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workspaceId, email, role } = body as { workspaceId: string; email: string; role: WorkspaceRole };

  if (!workspaceId || !email || !INVITABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "workspaceId, email, and a valid role are required" }, { status: 400 });
  }

  try {
    await requireRole(workspaceId, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    await enforcePlanLimit(workspaceId, "teamMembers");
  } catch (e) {
    if (e instanceof PlanLimitError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existingUser) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId: existingUser.id, role })
      .onConflictDoNothing();
    return NextResponse.json({ status: "added" });
  }

  await db.insert(workspaceInvites).values({ workspaceId, email, role, invitedBy: session.user.id });

  // Fire-and-forget — a missing RESEND_API_KEY (see sendInviteEmail) or a
  // transient send failure shouldn't fail the invite itself, since the
  // pending-invite row is what actually matters; the email is a courtesy
  // notification on top of it, not the mechanism.
  const [workspace, inviter] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1).then((r) => r[0]),
    db.select().from(users).where(eq(users.id, session.user.id)).limit(1).then((r) => r[0]),
  ]);
  if (workspace && inviter) {
    sendInviteEmail({
      to: email,
      workspaceName: workspace.name,
      inviterName: inviter.name || inviter.email,
      role,
      appUrl: new URL(req.url).origin,
    }).catch(() => {});
  }

  return NextResponse.json({ status: "invited" });
}
