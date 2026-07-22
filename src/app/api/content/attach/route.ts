import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { contentCards } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

/**
 * POST /api/content/attach — links a script or video to a content card
 * (or unlinks by passing cardId: null). This is the piece that closed the
 * gap noted in CLAUDE.md: contentCards.scriptId/videoId existed in the
 * schema since the Content Planning pass, but nothing in the UI ever set
 * them.
 *
 * A script or video should belong to at most one card — the "attach"
 * action from the Script/Video detail page picks which card it belongs
 * to, not the other way around, so if some other card in the workspace
 * already holds this scriptId/videoId, it gets cleared first. Without
 * that, re-attaching to a different card would leave two cards claiming
 * the same script, which is a more confusing bug than the one this
 * closes.
 *
 * Thumbnails are NOT handled by this route — a card can reasonably have
 * many thumbnail options, so that's a plain PATCH on the thumbnail row
 * itself (see /api/thumbnails/[id]), not an exclusive claim like this.
 */
const InputSchema = z.object({
  workspaceId: z.string(),
  field: z.enum(["scriptId", "videoId"]),
  resourceId: z.string(),
  cardId: z.string().nullable(), // null = detach from whichever card currently holds it
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { workspaceId, field, resourceId, cardId } = parsed.data;

  try {
    await requireRole(workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  if (cardId) {
    const [target] = await db
      .select()
      .from(contentCards)
      .where(and(eq(contentCards.id, cardId), eq(contentCards.workspaceId, workspaceId)))
      .limit(1);
    if (!target) return NextResponse.json({ error: "Content card not found" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(contentCards)
      .set({ [field]: null, updatedAt: new Date() })
      .where(and(eq(contentCards.workspaceId, workspaceId), eq(contentCards[field], resourceId)));
    if (cardId) {
      await tx
        .update(contentCards)
        .set({ [field]: resourceId, updatedAt: new Date() })
        .where(eq(contentCards.id, cardId));
    }
  });

  return NextResponse.json({ status: cardId ? "attached" : "detached" });
}
