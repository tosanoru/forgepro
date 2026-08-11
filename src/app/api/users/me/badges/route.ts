import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { badges, courses, userBadges } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";
import { resolveActiveWorkspace } from "@/lib/academy";

/**
 * GET /api/users/me/badges
 * Badges earned by the current user in the active workspace, newest first,
 * with course title attached for display.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await resolveActiveWorkspace(session.user.id, session.user.email);
  try {
    await requireRole(workspaceId, session.user.id, "client_viewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const rows = await db
    .select({
      badgeId: userBadges.badgeId,
      awardedAt: userBadges.awardedAt,
      slug: badges.slug,
      title: badges.title,
      description: badges.description,
      iconUrl: badges.iconUrl,
      courseId: badges.courseId,
      courseTitle: courses.title,
    })
    .from(userBadges)
    .innerJoin(badges, eq(badges.id, userBadges.badgeId))
    .leftJoin(courses, eq(courses.id, badges.courseId))
    .where(
      and(eq(userBadges.userId, session.user.id), eq(userBadges.workspaceId, workspaceId)),
    )
    .orderBy(desc(userBadges.awardedAt));

  return NextResponse.json({
    badges: rows.map((r) => ({
      id: r.badgeId,
      slug: r.slug,
      title: r.title,
      description: r.description,
      iconUrl: r.iconUrl,
      courseId: r.courseId,
      courseTitle: r.courseTitle,
      awardedAt: r.awardedAt.toISOString(),
    })),
  });
}
