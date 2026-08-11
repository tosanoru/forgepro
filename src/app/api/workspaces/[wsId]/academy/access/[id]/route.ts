import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { courseAccess, courseEnrollments, lessons, modules, userProgress } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";

export async function DELETE(_req: Request, { params }: { params: Promise<{ wsId: string; id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { wsId, id } = await params;

  try {
    await requireRole(wsId, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [grant] = await db
    .select()
    .from(courseAccess)
    .where(and(eq(courseAccess.id, id), eq(courseAccess.workspaceId, wsId)))
    .limit(1);
  if (!grant) return NextResponse.json({ error: "Access grant not found" }, { status: 404 });

  const courseLessonIds = await db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(eq(modules.courseId, grant.courseId));

  await db.transaction(async (tx) => {
    await tx
      .update(courseAccess)
      .set({ revokedAt: new Date() })
      .where(eq(courseAccess.id, id));

    if (courseLessonIds.length > 0) {
      const ids = courseLessonIds.map((l) => l.id);
      await tx
        .delete(userProgress)
        .where(
          and(
            eq(userProgress.userId, grant.userId),
            eq(userProgress.workspaceId, wsId),
            inArray(userProgress.lessonId, ids),
          ),
        );
    }

    await tx
      .delete(courseEnrollments)
      .where(
        and(
          eq(courseEnrollments.courseId, grant.courseId),
          eq(courseEnrollments.userId, grant.userId),
          eq(courseEnrollments.workspaceId, wsId),
        ),
      );
  });

  return NextResponse.json({ revoked: true });
}
