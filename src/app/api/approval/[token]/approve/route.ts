import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { resolveApprovalToken, ApprovalLinkError } from "@/lib/approval";

const VALID_STATUSES = ["approved", "changes_requested"];

/**
 * POST /api/approval/[token]/approve — the actual "Client Approval" action.
 * This is intentionally the only write a client can make to `videos`
 * (besides comments) — no title edits, no re-upload, no deleting.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let resolved;
  try {
    resolved = await resolveApprovalToken(token);
  } catch (e) {
    if (e instanceof ApprovalLinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { videoId, reviewStatus } = body as { videoId: string; reviewStatus: string };

  const video = resolved.videos.find((v) => v.id === videoId);
  if (!video) return NextResponse.json({ error: "This video isn't part of this review link" }, { status: 403 });
  if (!VALID_STATUSES.includes(reviewStatus)) {
    return NextResponse.json({ error: "reviewStatus must be 'approved' or 'changes_requested'" }, { status: 400 });
  }

  const [updated] = await db
    .update(videos)
    .set({ reviewStatus, updatedAt: new Date() })
    .where(eq(videos.id, videoId))
    .returning();

  if (!updated) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  return NextResponse.json({ video: { id: updated.id, reviewStatus: updated.reviewStatus } });
}
