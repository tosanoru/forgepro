import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { contentCards } from "@/db/schema";
import { getWorkspaceMembers } from "@/lib/workspace";
import { requireRole, PermissionError } from "@/lib/permissions";
import { getWorkspaceCard, mapCard } from "@/lib/content-server";
import { CONTENT_STAGES, type ContentStage } from "@/lib/content-types";

const InputSchema = z.object({
  workspaceId: z.string(),
  toStage: z.string(),
  completionDate: z.string().optional(),
});

/**
 * Ported directly from Forge's PATCH .../stage — the "only backfill a
 * stageDate when moving forward" logic is unchanged, since dragging a card
 * backward (e.g. sending it back from IN_REVIEW to PRODUCTION) shouldn't
 * claim the skipped stage was ever completed.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const toStage = parsed.data.toStage as ContentStage;
  if (!CONTENT_STAGES.includes(toStage)) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  try {
    await requireRole(parsed.data.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const existing = await getWorkspaceCard(parsed.data.workspaceId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fromIndex = CONTENT_STAGES.indexOf(existing.stage);
  const toIndex = CONTENT_STAGES.indexOf(toStage);

  const stageDates = { ...(existing.stageDates ?? {}) };
  if (toIndex > fromIndex) {
    stageDates[existing.stage] = parsed.data.completionDate ?? new Date().toISOString().slice(0, 10);
  }

  const [row] = await db
    .update(contentCards)
    .set({ stage: toStage, stageDates, updatedAt: new Date() })
    .where(eq(contentCards.id, id))
    .returning();

  const members = await getWorkspaceMembers(parsed.data.workspaceId);
  return NextResponse.json({ card: mapCard(row, new Map(members.map((m) => [m.id, m]))) });
}
