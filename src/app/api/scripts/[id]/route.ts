import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { scripts, scriptVersions, contentCards } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

async function loadScript(id: string) {
  const [script] = await db.select().from(scripts).where(eq(scripts.id, id)).limit(1);
  return script ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const script = await loadScript(id);
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(script.workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  return NextResponse.json({ script });
}

/** PATCH — edit content/title/status after generation (human-in-the-loop editing). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const script = await loadScript(id);
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(script.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { title, content, status } = body as { title?: string; content?: string; status?: string };

  // Only snapshot when content is actually changing — a title/status-only
  // edit doesn't need a version row, and saving the OLD content (not the
  // new one) before the overwrite is what makes "restore" mean "go back
  // to how it read before this edit," not "duplicate the current state."
  if (content !== undefined && content !== script.content) {
    await db.insert(scriptVersions).values({ scriptId: id, content: script.content, editedBy: session.user.id });
  }

  const [updated] = await db
    .update(scripts)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(status !== undefined ? { status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(scripts.id, id))
    .returning();

  if (status === "in_review" || status === "approved") {
    const targetStage = status === "in_review" ? "IDEA" : "SCRIPT";
    const [card] = await db
      .select({ id: contentCards.id, stage: contentCards.stage })
      .from(contentCards)
      .where(eq(contentCards.scriptId, id))
      .limit(1);
    if (card && card.stage !== targetStage) {
      await db
        .update(contentCards)
        .set({ stage: targetStage, updatedAt: new Date() })
        .where(eq(contentCards.id, card.id));
    }
  }

  return NextResponse.json({ script: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const script = await loadScript(id);
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(script.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await db.delete(scripts).where(eq(scripts.id, id));
  return NextResponse.json({ status: "deleted" });
}
