import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateWorkspace } from "@/lib/workspace";
import { requireRole, PermissionError } from "@/lib/permissions";

/**
 * PATCH /api/workspace/[id] — rename workspace (owner/admin only).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { name } = body as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const ws = await updateWorkspace(id, { name: name.trim() });
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  return NextResponse.json({ workspace: ws });
}
