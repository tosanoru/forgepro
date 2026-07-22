import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createChildWorkspace, getChildWorkspaces } from "@/lib/workspace";
import { requireRole, PermissionError } from "@/lib/permissions";

/**
 * New route — no Forge equivalent, since Forge never had sub-workspaces.
 * This is how an agency/production-company workspace spins up a client.
 *
 * GET  /api/workspace/[id]/children — list an agency's client workspaces
 * POST /api/workspace/[id]/children — create one (name required)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "reviewer"); // any member can see the client list
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const children = await getChildWorkspaces(id);
  return NextResponse.json({ children });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const { name } = body as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    // Only owner/admin of the parent workspace can spin up a new client.
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const child = await createChildWorkspace({
    parentWorkspaceId: id,
    name: name.trim(),
    ownerId: session.user.id,
  });

  return NextResponse.json({ workspace: child }, { status: 201 });
}
