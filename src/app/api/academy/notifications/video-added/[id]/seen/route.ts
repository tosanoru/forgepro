import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { lessonVideoNotifications } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";
import { resolveActiveWorkspace } from "@/lib/academy";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let workspaceId: string;
  try {
    workspaceId = await resolveActiveWorkspace(session.user.id, session.user.email);
  } catch {
    return NextResponse.json({ error: "No workspace available" }, { status: 400 });
  }

  try {
    await requireRole(workspaceId, session.user.id, "client_viewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [row] = await db
    .update(lessonVideoNotifications)
    .set({ seen: true })
    .where(
      and(
        eq(lessonVideoNotifications.id, id),
        eq(lessonVideoNotifications.userId, session.user.id),
        eq(lessonVideoNotifications.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!row) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

  return NextResponse.json({ notification: row });
}
