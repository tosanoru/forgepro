import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { courseAccess, courses, users, workspaceMembers } from "@/db/schema";
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

  const rows = await db
    .select({
      id: courseAccess.id,
      courseId: courseAccess.courseId,
      courseSlug: courses.slug,
      courseTitle: courses.title,
      userId: courseAccess.userId,
      userName: users.name,
      userEmail: users.email,
      grantedAt: courseAccess.grantedAt,
      revokedAt: courseAccess.revokedAt,
    })
    .from(courseAccess)
    .innerJoin(courses, eq(courses.id, courseAccess.courseId))
    .innerJoin(users, eq(users.id, courseAccess.userId))
    .where(eq(courseAccess.workspaceId, wsId))
    .orderBy(courseAccess.grantedAt);

  return NextResponse.json({ grants: rows });
}

const grantSchema = z.object({
  userId: z.string().min(1),
  courseId: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ wsId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { wsId } = await params;

  try {
    await requireRole(wsId, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  const { userId, courseId } = parsed.data;

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (!member) return NextResponse.json({ error: "User is not a member of this workspace" }, { status: 400 });

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 400 });
  }

  // Upsert: re-granting after a revoke clears the soft revoke and starts fresh.
  const [existing] = await db
    .select()
    .from(courseAccess)
    .where(
      and(
        eq(courseAccess.workspaceId, wsId),
        eq(courseAccess.courseId, courseId),
        eq(courseAccess.userId, userId),
      ),
    )
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(courseAccess)
      .set({ revokedAt: null, grantedBy: session.user.id, grantedAt: new Date() })
      .where(eq(courseAccess.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(courseAccess)
      .values({
        courseId,
        workspaceId: wsId,
        userId,
        grantedBy: session.user.id,
      })
      .returning();
  }

  return NextResponse.json({ grant: row }, { status: existing ? 200 : 201 });
}
