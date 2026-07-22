import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { contentCards } from "@/db/schema";
import { getWorkspaceMembers } from "@/lib/workspace";
import { requireRole, PermissionError } from "@/lib/permissions";
import { getWorkspaceCard, mapCard } from "@/lib/content-server";

const UpdateSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).optional(),
  dueDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  try {
    await requireRole(data.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const existing = await getWorkspaceCard(data.workspaceId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [row] = await db
    .update(contentCards)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
      ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(contentCards.id, id))
    .returning();

  const members = await getWorkspaceMembers(data.workspaceId);
  return NextResponse.json({ card: mapCard(row, new Map(members.map((m) => [m.id, m]))) });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const existing = await getWorkspaceCard(workspaceId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(contentCards).where(eq(contentCards.id, id));
  return NextResponse.json({ status: "deleted" });
}
