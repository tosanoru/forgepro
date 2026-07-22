import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { enforcePlanLimit, PlanLimitError } from "@/lib/plan-usage";
import { createDirectUpload } from "@/lib/mux";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const rows = await db.select().from(videos).where(eq(videos.workspaceId, id)).orderBy(desc(videos.createdAt));
  return NextResponse.json({ videos: rows });
}

/**
 * POST — creates the video row and a Mux direct upload in one step. Returns
 * the upload URL; the browser PUTs the file straight to Mux (see
 * VideoUploader.tsx), we never touch the file bytes. Mux's webhook fills in
 * muxAssetId/playbackId/duration once transcoding finishes.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const { title, corsOrigin } = body as { title: string; corsOrigin: string };
  if (!title?.trim() || !corsOrigin) {
    return NextResponse.json({ error: "title and corsOrigin are required" }, { status: 400 });
  }

  try {
    await requireRole(id, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    await enforcePlanLimit(id, "videoUploads");
  } catch (e) {
    if (e instanceof PlanLimitError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  try {
    const { uploadId, uploadUrl } = await createDirectUpload(corsOrigin);

    const [video] = await db
      .insert(videos)
      .values({
        workspaceId: id,
        title: title.trim(),
        muxUploadId: uploadId,
        status: "uploading",
        uploadedBy: session.user.id,
      })
      .returning();

    return NextResponse.json({ video, uploadUrl }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
