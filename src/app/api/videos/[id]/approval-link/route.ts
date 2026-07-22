import { NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { videos, approvalLinks } from "@/db/schema";
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

  const links = await db
    .select()
    .from(approvalLinks)
    .where(eq(approvalLinks.videoId, id))
    .orderBy(desc(approvalLinks.createdAt));

  return NextResponse.json({ links });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // Same bar as creating a link — editor+, not restricted to admin.
    await requireRole(video.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const { linkId, revoked } = body as { linkId?: string; revoked?: boolean };
  if (!linkId || typeof revoked !== "boolean") {
    return NextResponse.json({ error: "linkId and revoked are required" }, { status: 400 });
  }

  const [link] = await db
    .update(approvalLinks)
    .set({ revoked })
    .where(and(eq(approvalLinks.id, linkId), eq(approvalLinks.videoId, id)))
    .returning();
  if (!link) return NextResponse.json({ error: "Review link not found" }, { status: 404 });

  return NextResponse.json({ link });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    // editor+ can generate a review link — same bar as creating content,
    // not restricted to admin like AI settings/invites are.
    await requireRole(video.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const { label, expiresInDays } = body as { label?: string; expiresInDays?: number };

  const [link] = await db
    .insert(approvalLinks)
    .values({
      workspaceId: video.workspaceId,
      videoId: id,
      label: label?.trim() || video.title,
      createdBy: session.user.id,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
    })
    .returning();

  return NextResponse.json({ link }, { status: 201 });
}
