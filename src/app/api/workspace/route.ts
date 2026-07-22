import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import {
  ensureWorkspace,
  getWorkspace,
  getWorkspaceMembers,
  getWorkspaceRole,
  getTopLevelWorkspacesForUser,
  getChildWorkspaces,
} from "@/lib/workspace";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/active-workspace";

/**
 * GET /api/workspace — the caller's *active* workspace (see
 * ACTIVE_WORKSPACE_COOKIE / src/lib/active-workspace.ts), its members,
 * their role in it, plus the list of all top-level workspaces they belong
 * to (for the workspace switcher) and any client sub-workspaces if this
 * one is an agency.
 *
 * This used to always return the first-joined workspace regardless of
 * what the person had selected in the Sidebar switcher — that gap is
 * fixed here: a cookie set by POST /api/workspace/active now takes
 * priority, and only falls back to ensureWorkspace()'s default (first
 * membership, creating one if none exists) when there's no cookie or the
 * cookie points at a workspace the person isn't actually a member of.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const activeCookie = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;

  let workspaceId: string;
  if (activeCookie && (await getWorkspaceRole(activeCookie, session.user.id))) {
    // Cookie points at a workspace the person is actually a member of — trust it.
    workspaceId = activeCookie;
  } else {
    // No cookie, or it pointed at a workspace they've since lost access
    // to (removed from a client workspace, etc.) — fall back to default
    // resolution rather than erroring.
    workspaceId = await ensureWorkspace(session.user.id, session.user.email);
  }

  const [workspace, members, role, allWorkspaces] = await Promise.all([
    getWorkspace(workspaceId),
    getWorkspaceMembers(workspaceId),
    getWorkspaceRole(workspaceId, session.user.id),
    getTopLevelWorkspacesForUser(session.user.id),
  ]);

  const children = workspace?.type === "agency" ? await getChildWorkspaces(workspaceId) : [];

  return NextResponse.json({ workspace, members, role, allWorkspaces, children });
}
