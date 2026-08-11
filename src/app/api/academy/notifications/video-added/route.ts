import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { courses, lessons, lessonVideoNotifications, modules } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";
import { resolveActiveWorkspace } from "@/lib/academy";

/**
 * GET /api/academy/notifications/video-added
 * Unseen "a video was added to a lesson you'd already started" notices for
 * the current user in the active workspace. Marks nothing — the PATCH
 * :id/seen endpoint flips seen on view.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let workspaceId: string;
  try {
    workspaceId = await resolveActiveWorkspace(session.user.id, session.user.email);
  } catch {
    return NextResponse.json({ error: "No workspace available" }, { status: 400 });
  }

  try {
    await requireRole(workspaceId, session.user.id, "client_viewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const rows = await db
    .select({
      id: lessonVideoNotifications.id,
      lessonId: lessonVideoNotifications.lessonId,
      lessonNumber: lessons.lessonNumber,
      lessonTitle: lessons.title,
      courseId: courses.id,
      courseSlug: courses.slug,
      courseTitle: courses.title,
      createdAt: lessonVideoNotifications.createdAt,
      seen: lessonVideoNotifications.seen,
    })
    .from(lessonVideoNotifications)
    .innerJoin(lessons, eq(lessons.id, lessonVideoNotifications.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(
      and(
        eq(lessonVideoNotifications.userId, session.user.id),
        eq(lessonVideoNotifications.workspaceId, workspaceId),
        eq(lessonVideoNotifications.seen, false),
      ),
    )
    .orderBy(lessonVideoNotifications.createdAt);

  return NextResponse.json({ notifications: rows });
}
