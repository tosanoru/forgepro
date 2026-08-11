import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { badges, courses, courseEnrollments, lessons, modules, userBadges, userProgress } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";
import { assertCourseAccess, resolveActiveWorkspace } from "@/lib/academy";

type ModuleRow = typeof modules.$inferSelect;
type LessonRow = typeof lessons.$inferSelect;

const ProgressInput = z
  .object({
    status: z.enum(["in_progress", "completed"]).optional(),
    actionItemCompleted: z.boolean().optional(),
  })
  .refine((v) => v.status !== undefined || v.actionItemCompleted !== undefined, {
    message: "Provide status or actionItemCompleted",
  });

/**
 * PATCH /api/academy/lessons/:lessonId/progress
 * Marks a lesson in_progress/completed or toggles its action item. The course
 * (and its access grant) is derived server-side from the lesson, so the client
 * only needs the lessonId. Badge awarding happens here when the course's final
 * lesson is completed. Course completedAt on the enrollment is updated to
 * reflect "finished the course".
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lessonId } = await params;

  let body: z.infer<typeof ProgressInput>;
  try {
    body = ProgressInput.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const workspaceId = await resolveActiveWorkspace(session.user.id, session.user.email);
  try {
    await requireRole(workspaceId, session.user.id, "client_viewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
  if (!lesson) return NextResponse.json({ error: "Lesson not found" }, { status: 404 });

  const [moduleRow] = await db.select().from(modules).where(eq(modules.id, lesson.moduleId)).limit(1);
  if (!moduleRow) return NextResponse.json({ error: "Lesson has no module" }, { status: 404 });

  const [course] = await db.select().from(courses).where(eq(courses.id, moduleRow.courseId)).limit(1);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  try {
    await assertCourseAccess(workspaceId, session.user.id, course.id);
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [existing] = await db
    .select()
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, session.user.id),
        eq(userProgress.workspaceId, workspaceId),
        eq(userProgress.lessonId, lesson.id),
      ),
    )
    .limit(1);

  const now = new Date();
  const update: Partial<typeof userProgress.$inferInsert> = { updatedAt: now };

  let isCompleted = existing?.status === "completed" || false;
  if (body.status === "completed" && !isCompleted) {
    update.status = "completed";
    update.completedAt = now;
    isCompleted = true;
  } else if (body.status === "in_progress" && existing?.status !== "completed") {
    update.status = "in_progress";
  }
  if (body.actionItemCompleted !== undefined) {
    update.actionItemCompleted = body.actionItemCompleted;
  }

  await db
    .insert(userProgress)
    .values({
      userId: session.user.id,
      workspaceId,
      lessonId: lesson.id,
      status: update.status ?? existing?.status ?? "in_progress",
      actionItemCompleted: update.actionItemCompleted ?? existing?.actionItemCompleted ?? false,
      completedAt: update.completedAt ?? existing?.completedAt ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userProgress.userId, userProgress.workspaceId, userProgress.lessonId],
      set: update,
    });

  // Badge award on first completion of the course's final lesson.
  let badgeAwarded: { slug: string; title: string } | null = null;
  if (isCompleted) {
    const moduleRows: ModuleRow[] = await db.select().from(modules).where(eq(modules.courseId, course.id));
    const moduleIds = moduleRows.map((m) => m.id);
    const allLessons: LessonRow[] = moduleIds.length
      ? await db.select().from(lessons).where(inArray(lessons.moduleId, moduleIds))
      : [];
    const allProgress = await db
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
      );
    const allDone =
      allLessons.length > 0 &&
      allLessons.every((l) => allProgress.some((p) => p.lessonId === l.id && p.status === "completed"));
    if (allDone) {
      const [badge] = await db
        .select()
        .from(badges)
        .where(and(eq(badges.courseId, course.id), eq(badges.slug, `${course.slug}-complete`)))
        .limit(1);
      if (badge) {
        await db
          .insert(userBadges)
          .values({ userId: session.user.id, workspaceId, badgeId: badge.id })
          .onConflictDoNothing();
        badgeAwarded = { slug: badge.slug, title: badge.title };
      }
    }
  }

  const [updated] = await db
    .select()
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, session.user.id),
        eq(userProgress.workspaceId, workspaceId),
        eq(userProgress.lessonId, lesson.id),
      ),
    )
    .limit(1);

  await db
    .update(courseEnrollments)
    .set({ lastActivityAt: now, completedAt: isCompleted ? now : undefined })
    .where(
      and(
        eq(courseEnrollments.courseId, course.id),
        eq(courseEnrollments.userId, session.user.id),
        eq(courseEnrollments.workspaceId, workspaceId),
      ),
    );

  return NextResponse.json({
    progress: updated
      ? {
          status: updated.status,
          actionItemCompleted: updated.actionItemCompleted,
          completedAt: updated.completedAt?.toISOString() ?? null,
        }
      : null,
    badgeAwarded,
  });
}
