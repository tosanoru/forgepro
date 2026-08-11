import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { courses, lessons, modules, userProgress } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";
import { assertCourseAccess, resolveActiveWorkspace } from "@/lib/academy";

type ModuleRow = typeof modules.$inferSelect;
type LessonRow = typeof lessons.$inferSelect;
type ProgressRow = typeof userProgress.$inferSelect;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug, lessonId } = await params;

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

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  if (lesson.moduleId !== undefined) {
    const [moduleRow] = await db.select().from(modules).where(eq(modules.id, lesson.moduleId)).limit(1);
    if (!moduleRow || moduleRow.courseId !== course.id) {
      return NextResponse.json({ error: "Lesson not in this course" }, { status: 404 });
    }
  }

  const moduleRows: ModuleRow[] = await db
    .select()
    .from(modules)
    .where(eq(modules.courseId, course.id))
    .orderBy(asc(modules.order));
  const moduleIds = moduleRows.map((m) => m.id);
  const allLessons: LessonRow[] = moduleIds.length
    ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds)).orderBy(asc(lessons.order))
    : [];
  const idx = allLessons.findIndex((l) => l.id === lesson.id);

  const [progressRows] = await Promise.all([
    db
      .select()
      .from(userProgress)
      .where(
        and(
          eq(userProgress.userId, session.user.id),
          eq(userProgress.workspaceId, workspaceId),
          inArray(
            userProgress.lessonId,
            allLessons.map((l) => l.id),
          ),
        ),
      ),
  ]);
  const progressByLesson = new Map<string, ProgressRow>();
  for (const p of progressRows) progressByLesson.set(p.lessonId, p);

  const progress = progressByLesson.get(lesson.id);
  const prevLesson = idx > 0 ? allLessons[idx - 1] : null;
  const nextLesson = idx >= 0 && idx < allLessons.length - 1 ? allLessons[idx + 1] : null;

  return NextResponse.json({
    lesson: {
      id: lesson.id,
      title: lesson.title,
      lessonNumber: lesson.lessonNumber,
      contentMd: lesson.contentMd,
      videoUrl: lesson.videoUrl,
      videoProvider: lesson.videoProvider,
      videoDurationSeconds: lesson.videoDurationSeconds,
      actionItem: lesson.actionItem,
      estimatedMinutes: lesson.estimatedMinutes,
      order: lesson.order,
    },
    course: { id: course.id, slug: course.slug, title: course.title, level: course.level },
    module: {
      id: moduleRows.find((m) => m.id === lesson.moduleId)?.id ?? lesson.moduleId,
      title: moduleRows.find((m) => m.id === lesson.moduleId)?.title ?? "",
    },
    progress: progress
      ? {
          status: progress.status,
          actionItemCompleted: progress.actionItemCompleted,
          completedAt: progress.completedAt?.toISOString() ?? null,
        }
      : null,
    navigation: {
      prevLessonId: prevLesson?.id ?? null,
      prevLessonTitle: prevLesson?.title ?? null,
      nextLessonId: nextLesson?.id ?? null,
      nextLessonTitle: nextLesson?.title ?? null,
      lessonIndex: idx,
      totalLessons: allLessons.length,
    },
  });
}
