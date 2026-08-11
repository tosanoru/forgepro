import { NextResponse } from "next/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { courses, lessons, modules, userProgress, workspaceMembers, users } from "@/db/schema";
import { PermissionError, requireRole } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { wsId } = await params;

  try {
    await requireRole(wsId, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const members = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, wsId))
    .orderBy(desc(workspaceMembers.joinedAt));

  const memberIds = members.map((m) => m.userId);

  const courseRows = await db
    .select({
      courseId: courses.id,
      courseSlug: courses.slug,
      courseTitle: courses.title,
      lessonId: lessons.id,
    })
    .from(courses)
    .innerJoin(modules, eq(modules.courseId, courses.id))
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(eq(courses.status, "published"));

  const progressRows = memberIds.length
    ? await db
        .select({
          userId: userProgress.userId,
          lessonId: userProgress.lessonId,
          status: userProgress.status,
        })
        .from(userProgress)
        .where(and(eq(userProgress.workspaceId, wsId), inArray(userProgress.userId, memberIds)))
    : [];

  const progressByUser: Record<string, Record<string, number>> = {};
  for (const p of progressRows) {
    const lessonCourse = courseRows.find((c) => c.lessonId === p.lessonId);
    if (!lessonCourse) continue;
    if (p.status !== "completed") continue;
    progressByUser[p.userId] ??= {};
    progressByUser[p.userId][lessonCourse.courseId] =
      (progressByUser[p.userId][lessonCourse.courseId] ?? 0) + 1;
  }

  const courseTotals = new Map<string, { slug: string; title: string; totalLessons: number }>();
  for (const c of courseRows) {
    const cur = courseTotals.get(c.courseId) ?? {
      slug: c.courseSlug,
      title: c.courseTitle,
      totalLessons: 0,
    };
    cur.totalLessons++;
    courseTotals.set(c.courseId, cur);
  }

  const team = members.map((m) => {
    const memberProgress = progressByUser[m.userId] ?? {};
    return {
      userId: m.userId,
      role: m.role,
      name: m.name,
      email: m.email,
      image: m.image,
      courses: Array.from(courseTotals.entries()).map(([courseId, info]) => {
        const completedLessons = memberProgress[courseId] ?? 0;
        const percent = info.totalLessons > 0 ? (completedLessons / info.totalLessons) * 100 : 0;
        return {
          courseId,
          courseSlug: info.slug,
          courseTitle: info.title,
          completedLessons,
          totalLessons: info.totalLessons,
          percent: Math.round(percent),
        };
      }),
    };
  });

  return NextResponse.json({ team });
}
