import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videos, videoComments } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(video.workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const comments = await db
    .select()
    .from(videoComments)
    .where(eq(videoComments.videoId, id))
    .orderBy(asc(videoComments.timestampSeconds));

  return NextResponse.json({ comments });
}

/**
 * Team-member comment path. External/client comments go through
 * /api/approval/[token]/comments instead, which has no session and writes
 * guestName rather than authorId — see that route and videoComments in
 * schema.ts.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(video.workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { timestampSeconds, content } = body as { timestampSeconds: number; content: string };
  if (typeof timestampSeconds !== "number" || !content?.trim()) {
    return NextResponse.json({ error: "timestampSeconds and content are required" }, { status: 400 });
  }

  const [comment] = await db
    .insert(videoComments)
    .values({
      videoId: id,
      workspaceId: video.workspaceId,
      timestampSeconds: Math.round(timestampSeconds),
      content: content.trim(),
      authorId: session.user.id,
    })
    .returning();

  return NextResponse.json({ comment }, { status: 201 });
}
