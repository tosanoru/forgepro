import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandAssets } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { deleteObject } from "@/lib/r2";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [asset] = await db.select().from(brandAssets).where(eq(brandAssets.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(asset.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await deleteObject(asset.r2Key);
  await db.delete(brandAssets).where(eq(brandAssets.id, id));
  return NextResponse.json({ status: "deleted" });
}
