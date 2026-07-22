import { NextResponse } from "next/server";
import { resolveApprovalToken, ApprovalLinkError } from "@/lib/approval";

/**
 * GET /api/approval/[token] — resolves a review link for an external
 * client. Deliberately returns only what's needed to render the review
 * page: no workspace member list, no billing info, nothing beyond the
 * video(s) this specific link was scoped to.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { link, workspace, videos } = await resolveApprovalToken((await params).token);
    return NextResponse.json({
      label: link.label,
      workspace: { name: workspace.name, branding: workspace.branding },
      videos: videos.map((v) => ({
        id: v.id,
        title: v.title,
        muxPlaybackId: v.muxPlaybackId,
        status: v.status,
        reviewStatus: v.reviewStatus,
        durationSeconds: v.durationSeconds,
      })),
    });
  } catch (e) {
    if (e instanceof ApprovalLinkError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
