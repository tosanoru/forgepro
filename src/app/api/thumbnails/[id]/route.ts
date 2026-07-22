import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { thumbnails } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { deleteObject } from "@/lib/r2";

/**
 * PATCH — sets or clears which content card this thumbnail belongs to.
 * Unlike scripts/videos (one card each, see /api/content/attach), a card
 * can reasonably have several thumbnail options, so this is a plain write
 * on the thumbnail row rather than an exclusive-claim dance.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [thumbnail] = await db.select().from(thumbnails).where(eq(thumbnails.id, id)).limit(1);
  if (!thumbnail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(thumbnail.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { contentCardId } = body as { contentCardId: string | null };

  const [updated] = await db
    .update(thumbnails)
    .set({ contentCardId })
    .where(eq(thumbnails.id, id))
    .returning();

  return NextResponse.json({ thumbnail: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [thumbnail] = await db.select().from(thumbnails).where(eq(thumbnails.id, id)).limit(1);
  if (!thumbnail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(thumbnail.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await deleteObject(thumbnail.r2Key);
  await db.delete(thumbnails).where(eq(thumbnails.id, id));
  return NextResponse.json({ status: "deleted" });
}
