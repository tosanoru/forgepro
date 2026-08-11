import { NextResponse } from "next/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { courses, lessons, modules, userProgress } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";
import { assertCourseAccess, resolveActiveWorkspace } from "@/lib/academy";

type ModuleRow = typeof modules.$inferSelect;
type LessonRow = typeof lessons.$inferSelect;

/**
 * GET /api/academy/courses/:slug/progress
 * Derived progress (§3, computed at query time — never stored): overall course
 * completion, per-module completion, and "continue where you left off"
 * (most recent in_progress lesson by updated_at).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;

  const workspaceId = await resolveActiveWorkspace(session.user.id, session.user.email);
  try {
    await requireRole(workspaceId, session.user.id, "client_viewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [course] = await db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  try {
    await assertCourseAccess(workspaceId, session.user.id, course.id);
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const moduleRows: ModuleRow[] = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, course.id))
    .orderBy(asc(modules.order));

  const moduleIds = moduleRows.map((m) => m.id);
  const lessonRows: LessonRow[] = moduleIds.length
    ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds)).orderBy(asc(lessons.order))
    : [];

  const lessonIds = lessonRows.map((l) => l.id);
  const progressRows = lessonIds.length
    ? await db
        .select()
        .from(userProgress)
        .where(
          and(
            eq(userProgress.userId, session.user.id),
            eq(userProgress.workspaceId, workspaceId),
            inArray(userProgress.lessonId, lessonIds),
          ),
        )
        .orderBy(desc(userProgress.updatedAt))
    : [];

  const progressByLesson = new Map(progressRows.map((p) => [p.lessonId, p]));

  const totalLessons = lessonRows.length;
  let completedLessons = 0;
  for (const l of lessonRows) {
    if (progressByLesson.get(l.id)?.status === "completed") completedLessons += 1;
  }

  const modulesOut = moduleRows.map((m) => {
    const modLessons = lessonRows.filter((l) => l.moduleId === m.id);
    let modCompleted = 0;
    for (const l of modLessons) {
      if (progressByLesson.get(l.id)?.status === "completed") modCompleted += 1;
    }
    return {
      id: m.id,
      title: m.title,
      order: m.order,
      lessonCount: modLessons.length,
      completedLessons: modCompleted,
      percent: modLessons.length > 0 ? Math.round((modCompleted / modLessons.length) * 100) : 0,
    };
  });

  const continueLesson = progressRows
    .filter((p) => p.status === "in_progress")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  return NextResponse.json({
    course: { id: course.id, slug: course.slug, title: course.title },
    progress: {
      completedLessons,
      totalLessons,
      percent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
    },
    modules: modulesOut,
    continueLessonId: continueLesson?.lessonId ?? null,
  });
}
