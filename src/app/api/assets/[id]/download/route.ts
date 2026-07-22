import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandAssets } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { createDownloadUrl } from "@/lib/r2";

/**
 * Bucket is private (not public-read) so every download goes through a
 * short-lived presigned URL rather than a permanent public link — this is
 * what keeps a workspace's assets from being guessable/shareable outside
 * the permission system.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [asset] = await db.select().from(brandAssets).where(eq(brandAssets.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(asset.workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const url = await createDownloadUrl(asset.r2Key);
  return NextResponse.json({ url });
}
