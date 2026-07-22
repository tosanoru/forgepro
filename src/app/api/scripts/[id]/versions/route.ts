import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { scripts, scriptVersions } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [script] = await db.select().from(scripts).where(eq(scripts.id, id)).limit(1);
  if (!script) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(script.workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const versions = await db
    .select()
    .from(scriptVersions)
    .where(eq(scriptVersions.scriptId, id))
    .orderBy(desc(scriptVersions.createdAt));

  return NextResponse.json({ versions });
}
