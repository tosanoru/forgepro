import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvalLinks, videos, workspaces } from "@/db/schema";

export class ApprovalLinkError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolves an approval token to the workspace/video it grants access to.
 * This is deliberately NOT built on top of requireRole()/can() — approval
 * links are the no-account path (see approvalLinks table comment in
 * schema.ts); there's no user, no session, no workspace_member row to check
 * a role against. Every route under /api/approval/[token]/* should call
 * this instead of auth().
 */
export async function resolveApprovalToken(token: string) {
  const [link] = await db.select().from(approvalLinks).where(eq(approvalLinks.token, token)).limit(1);

  if (!link) throw new ApprovalLinkError("This review link doesn't exist.", 404);
  if (link.revoked) throw new ApprovalLinkError("This review link has been revoked.", 410);
  if (link.expiresAt && link.expiresAt < new Date()) throw new ApprovalLinkError("This review link has expired.", 410);

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, link.workspaceId)).limit(1);
  if (!workspace) throw new ApprovalLinkError("This review link doesn't exist.", 404);

  // Scoped to one video if videoId is set, otherwise every video in the workspace.
  const scopedVideos = link.videoId
    ? await db.select().from(videos).where(and(eq(videos.id, link.videoId), eq(videos.workspaceId, link.workspaceId)))
    : await db.select().from(videos).where(eq(videos.workspaceId, link.workspaceId));

  return { link, workspace, videos: scopedVideos };
}
