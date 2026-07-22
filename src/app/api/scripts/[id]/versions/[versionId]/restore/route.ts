import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { scripts, scriptVersions } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

/**
 * POST — restores a script to a previous version's content. The current
 * content is snapshotted into a new version row first, same as any other
 * edit (see PATCH /api/scripts/[id]) — restoring is just a special case
 * of "content changed," so it never loses the state it's restoring FROM
 * either. Nothing in this history is ever truly destructive.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, versionId } = await params;

  const [script] = await db.select().from(scripts).where(eq(scripts.id, id)).limit(1);
  if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 });

  try {
    await requireRole(script.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [version] = await db
    .select()
    .from(scriptVersions)
    .where(eq(scriptVersions.id, versionId))
    .limit(1);
  if (!version || version.scriptId !== id) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  if (version.content !== script.content) {
    await db.insert(scriptVersions).values({ scriptId: id, content: script.content, editedBy: session.user.id });
  }

  const [updated] = await db
    .update(scripts)
    .set({ content: version.content, updatedAt: new Date() })
    .where(eq(scripts.id, id))
    .returning();

  return NextResponse.json({ script: updated });
}
