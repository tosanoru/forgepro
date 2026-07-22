import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getWorkspaceRole } from "@/lib/workspace";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/active-workspace";

/**
 * POST /api/workspace/active — called when someone picks a different
 * workspace in the Sidebar switcher. This is the piece that was always
 * missing: the switcher UI existed and listed the right options, but
 * nothing ever wrote a selection anywhere, so GET /api/workspace had no
 * way to know a switch had happened.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { workspaceId } = body as { workspaceId: string };
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  // Refuse to switch to a workspace the person isn't actually a member of
  // — the cookie is trusted by GET /api/workspace precisely because this
  // check happens here, once, at write time.
  const role = await getWorkspaceRole(workspaceId, session.user.id);
  if (!role) return NextResponse.json({ error: "You're not a member of that workspace." }, { status: 403 });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // a year — this is a preference, not a session
  });

  return NextResponse.json({ status: "switched", workspaceId });
}
