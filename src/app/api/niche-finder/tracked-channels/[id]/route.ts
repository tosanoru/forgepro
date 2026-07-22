import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { userTrackedChannels } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [tracked] = await db.select().from(userTrackedChannels).where(eq(userTrackedChannels.id, id)).limit(1);
  if (!tracked) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(tracked.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await db.delete(userTrackedChannels).where(eq(userTrackedChannels.id, id));
  return NextResponse.json({ status: "deleted" });
}
