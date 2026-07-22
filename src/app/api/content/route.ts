import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { contentCards } from "@/db/schema";
import { getWorkspaceMembers } from "@/lib/workspace";
import { requireRole, PermissionError } from "@/lib/permissions";
import { mapCard } from "@/lib/content-server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [rows, members] = await Promise.all([
    db.select().from(contentCards).where(eq(contentCards.workspaceId, workspaceId)).orderBy(desc(contentCards.createdAt)),
    getWorkspaceMembers(workspaceId),
  ]);

  const membersById = new Map(members.map((m) => [m.id, m]));
  return NextResponse.json({ cards: rows.map((r) => mapCard(r, membersById)), members });
}

const InputSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(200),
  format: z.enum(["short", "long"]),
  notes: z.string().max(5000).optional(),
  dueDate: z.string().optional(),
  assigneeId: z.string().optional(),
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
  const data = parsed.data;

  try {
    await requireRole(data.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [row] = await db
    .insert(contentCards)
    .values({
      workspaceId: data.workspaceId,
      name: data.name,
      format: data.format,
      stage: "IDEA",
      notes: data.notes ?? "",
      stageDates: {},
      dueDate: data.dueDate ?? null,
      assigneeId: data.assigneeId ?? null,
      createdBy: session.user.id,
    })
    .returning();

  const members = await getWorkspaceMembers(data.workspaceId);
  return NextResponse.json({ card: mapCard(row, new Map(members.map((m) => [m.id, m]))) }, { status: 201 });
}
