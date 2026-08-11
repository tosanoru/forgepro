import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { courseEnrollments, courses, lessons, modules, userProgress } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";
import { getCourseAccessScope, resolveActiveWorkspace } from "@/lib/academy";

/**
 * GET /api/academy/courses
 * Access-filtered list of published courses visible to the current user in
 * the active workspace. Non-admins only see courses they hold a non-revoked
 * course_access grant for. Every course ships with a computed progress ring
 * for the requesting user (completed/total lessons).
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

  const scope = await getCourseAccessScope(workspaceId, session.user.id);

  const courseRows = scope.isAdmin
    ? await db.select().from(courses).where(eq(courses.status, "published"))
    : await db
        .select()
        .from(courses)
        .where(and(eq(courses.status, "published"), inArray(courses.id, scope.courseIds ?? [])));

  type ModuleRow = typeof modules.$inferSelect;
  type LessonRow = typeof lessons.$inferSelect;
  type ProgressRow = typeof userProgress.$inferSelect;
  type EnrollmentRow = typeof courseEnrollments.$inferSelect;

  const courseIds = courseRows.map((c) => c.id);
  const moduleRows: ModuleRow[] = courseIds.length
    ? await db.select().from(modules).where(inArray(modules.courseId, courseIds))
    : [];
  const moduleIds = moduleRows.map((m) => m.id);
  const lessonRows: LessonRow[] = moduleIds.length
    ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds))
    : [];
  const lessonIds = lessonRows.map((l) => l.id);

  const [progressRows, enrollmentRows] = await Promise.all([
    lessonIds.length
      ? db
          .select()
          .from(userProgress)
          .where(
            and(
              eq(userProgress.userId, session.user.id),
              eq(userProgress.workspaceId, workspaceId),
              inArray(userProgress.lessonId, lessonIds),
            ),
          )
      : Promise.resolve([] as ProgressRow[]),
    courseIds.length
      ? db
          .select()
          .from(courseEnrollments)
          .where(
            and(
              eq(courseEnrollments.userId, session.user.id),
              eq(courseEnrollments.workspaceId, workspaceId),
              inArray(courseEnrollments.courseId, courseIds),
            ),
          )
      : Promise.resolve([] as EnrollmentRow[]),
  ]);

  const moduleByCourse = new Map<string, ModuleRow[]>();
  for (const m of moduleRows) {
    const list = moduleByCourse.get(m.courseId) ?? [];
    list.push(m);
    moduleByCourse.set(m.courseId, list);
  }
  const lessonByModule = new Map<string, LessonRow[]>();
  for (const l of lessonRows) {
    const list = lessonByModule.get(l.moduleId) ?? [];
    list.push(l);
    lessonByModule.set(l.moduleId, list);
  }
  const completedLessonIds = new Set(progressRows.filter((p) => p.status === "completed").map((p) => p.lessonId));
  const enrolledCourseIds = new Set(enrollmentRows.map((e) => e.courseId));

  const summary = courseRows.map((c) => {
    const mods = moduleByCourse.get(c.id) ?? [];
    const totalLessons = mods.reduce((n, m) => n + (lessonByModule.get(m.id)?.length ?? 0), 0);
    let completedLessons = 0;
    for (const m of mods) {
      for (const l of lessonByModule.get(m.id) ?? []) {
        if (completedLessonIds.has(l.id)) completedLessons += 1;
      }
    }
    const percent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      level: c.level,
      estimatedMinutes: c.estimatedMinutes,
      coverImageUrl: c.coverImageUrl,
      moduleCount: mods.length,
      lessonCount: totalLessons,
      enrolled: enrolledCourseIds.has(c.id),
      progress: { completedLessons, totalLessons, percent },
    };
  });

  return NextResponse.json({ courses: summary });
}
