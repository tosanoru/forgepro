import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videoComments } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

/**
 * PATCH — team members only (reviewer+), not the approval-link (external
 * client) path — a client can leave a comment but resolving it is the
 * team's call, not theirs. That's a deliberate asymmetry: see
 * /api/approval/[token]/comments for the client-facing comment path,
 * which has no equivalent resolve action.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { commentId } = await params;

  const [comment] = await db.select().from(videoComments).where(eq(videoComments.id, commentId)).limit(1);
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(comment.workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { resolved } = body as { resolved: boolean };

  if (typeof resolved !== "boolean") {
    return NextResponse.json({ error: "resolved must be a boolean" }, { status: 400 });
  }

  const [updated] = await db
    .update(videoComments)
    .set({ resolved })
    .where(eq(videoComments.id, commentId))
    .returning();

  return NextResponse.json({ comment: updated });
}
