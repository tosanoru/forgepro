import { NextResponse } from "next/server";
import { eq, and, gte, isNull, count } from "drizzle-orm";
import { db } from "@/db";
import { videoComments } from "@/db/schema";
import { resolveApprovalToken, ApprovalLinkError } from "@/lib/approval";

/**
 * A guest posting through an approval link has no account and no session
 * — the only identity is `guestName`, which is client-supplied and
 * unverified (anyone with the link can type any name). That rules out any
 * per-identity rate limit; the only thing that's actually enforceable is
 * a per-video ceiling on how many guest comments can land in a short
 * window, regardless of what name they're posted under. 20 comments in
 * 10 minutes is generous for real review feedback (a client leaving
 * timestamped notes through a video) while still capping a scripted
 * flood at a few dozen rows instead of unbounded.
 */
const GUEST_COMMENT_WINDOW_MS = 10 * 60 * 1000;
const GUEST_COMMENT_LIMIT = 20;
const MAX_COMMENT_LENGTH = 2000;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let resolved;
  try {
    resolved = await resolveApprovalToken(token);
  } catch (e) {
    if (e instanceof ApprovalLinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { videoId, timestampSeconds, content, guestName } = body as {
    videoId: string;
    timestampSeconds: number;
    content: string;
    guestName?: string;
  };

  const video = resolved.videos.find((v) => v.id === videoId);
  if (!video) {
    return NextResponse.json({ error: "This video isn't part of this review link" }, { status: 403 });
  }
  if (typeof timestampSeconds !== "number" || !content?.trim()) {
    return NextResponse.json({ error: "timestampSeconds and content are required" }, { status: 400 });
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: `Comments are limited to ${MAX_COMMENT_LENGTH} characters.` }, { status: 400 });
  }

  const since = new Date(Date.now() - GUEST_COMMENT_WINDOW_MS);
  const [{ recentCount }] = await db
    .select({ recentCount: count() })
    .from(videoComments)
    .where(and(eq(videoComments.videoId, videoId), isNull(videoComments.authorId), gte(videoComments.createdAt, since)));
  if (recentCount >= GUEST_COMMENT_LIMIT) {
    return NextResponse.json(
      { error: "Too many comments on this video in a short window — please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const [comment] = await db
    .insert(videoComments)
    .values({
      videoId,
      workspaceId: resolved.workspace.id,
      timestampSeconds: Math.round(timestampSeconds),
      content: content.trim(),
      guestName: guestName?.trim().slice(0, 100) || "Client",
    })
    .returning();

  return NextResponse.json({ comment }, { status: 201 });
}

/** GET — comment thread for the video(s) this link covers, so the public page can render it. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const videoId = new URL(req.url).searchParams.get("videoId");

  let resolved;
  try {
    resolved = await resolveApprovalToken(token);
  } catch (e) {
    if (e instanceof ApprovalLinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const video = resolved.videos.find((v) => v.id === videoId);
  if (!video) return NextResponse.json({ error: "This video isn't part of this review link" }, { status: 403 });

  const comments = await db.select().from(videoComments).where(eq(videoComments.videoId, video.id));
  return NextResponse.json({ comments });
}
