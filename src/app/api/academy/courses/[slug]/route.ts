import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { courseEnrollments, courses, lessons, modules, userProgress } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";
import { assertCourseAccess, resolveActiveWorkspace } from "@/lib/academy";

type ModuleRow = typeof modules.$inferSelect;
type LessonRow = typeof lessons.$inferSelect;
type ProgressRow = typeof userProgress.$inferSelect;

const PUBLISHED = { status: "published" } as const;

/** GET — course detail with modules + lesson summaries (content_md omitted, full body is fetched per-lesson). */
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

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.slug, slug), eq(courses.status, PUBLISHED.status)))
    .limit(1);
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
    .orderBy(modules.order);

  const moduleIds = moduleRows.map((m) => m.id);
  const lessonRows: LessonRow[] = moduleIds.length
    ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds)).orderBy(lessons.order)
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
    db
      .select()
      .from(courseEnrollments)
      .where(
        and(
          eq(courseEnrollments.courseId, course.id),
          eq(courseEnrollments.userId, session.user.id),
          eq(courseEnrollments.workspaceId, workspaceId),
        ),
      )
      .limit(1),
  ]);

  const progressByLesson = new Map<string, ProgressRow>();
  for (const p of progressRows) progressByLesson.set(p.lessonId, p);

  const modulesOut = moduleRows.map((m) => ({
    id: m.id,
    title: m.title,
    order: m.order,
    lessons: lessonRows
      .filter((l) => l.moduleId === m.id)
      .map((l) => {
        const prog = progressByLesson.get(l.id);
        return {
          id: l.id,
          moduleId: l.moduleId,
          title: l.title,
          lessonNumber: l.lessonNumber,
          videoUrl: l.videoUrl,
          videoProvider: l.videoProvider,
          videoDurationSeconds: l.videoDurationSeconds,
          actionItem: l.actionItem,
          estimatedMinutes: l.estimatedMinutes,
          order: l.order,
          progress: prog
            ? {
                status: prog.status,
                actionItemCompleted: prog.actionItemCompleted,
                completedAt: prog.completedAt?.toISOString() ?? null,
              }
            : null,
        };
      }),
  }));

  return NextResponse.json({
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      level: course.level,
      estimatedMinutes: course.estimatedMinutes,
      coverImageUrl: course.coverImageUrl,
      status: course.status,
      createdAt: course.createdAt.toISOString(),
    },
    modules: modulesOut,
    enrolled: enrollmentRows.length > 0,
  });
}

/** POST — enroll the current user in this course (upsert semantics; the unique index guards double rows). */
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
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

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.slug, slug), eq(courses.status, PUBLISHED.status)))
    .limit(1);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  try {
    await assertCourseAccess(workspaceId, session.user.id, course.id);
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await db
    .insert(courseEnrollments)
    .values({ courseId: course.id, userId: session.user.id, workspaceId })
    .onConflictDoNothing();

  return NextResponse.json({ enrolled: true });
}
