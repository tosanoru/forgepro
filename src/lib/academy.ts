import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { courseAccess } from "@/db/schema";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/active-workspace";
import { can, PermissionError } from "@/lib/permissions";
import { ensureWorkspace, getWorkspaceRole } from "@/lib/workspace";

/**
 * Academy routes are deliberately NOT namespaced under /api/workspace/:id —
 * the active workspace is resolved server-side from the ACTIVE_WORKSPACE_COOKIE,
 * same precedence as GET /api/workspace (cookie wins, then ensureWorkspace).
 */
export async function resolveActiveWorkspace(userId: string, email?: string | null): Promise<string> {
  const store = await cookies();
  const activeId = store.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  if (activeId) {
    const role = await getWorkspaceRole(activeId, userId);
    if (role) return activeId;
  }
  return ensureWorkspace(userId, email ?? "");
}

export interface CourseAccessScope {
  role: string | null;
  /** Admins/owners implicitly see every course; courseIds is null to mean "no filter". */
  isAdmin: boolean;
  courseIds: string[] | null;
}

/**
 * Resolves what the current user may see. Admins/owners bypass the
 * course_access table entirely; every other member is limited to courses
 * with a non-revoked grant row for them (see schema comment on courseAccess).
 */
export async function getCourseAccessScope(workspaceId: string, userId: string): Promise<CourseAccessScope> {
  const role = await getWorkspaceRole(workspaceId, userId);
  if (!role) return { role: null, isAdmin: false, courseIds: [] };
  if (can(role, "admin")) return { role, isAdmin: true, courseIds: null };

  const rows = await db
    .select({ courseId: courseAccess.courseId })
    .from(courseAccess)
    .where(
      and(
        eq(courseAccess.workspaceId, workspaceId),
        eq(courseAccess.userId, userId),
        isNull(courseAccess.revokedAt),
      ),
    );
  return { role, isAdmin: false, courseIds: rows.map((r) => r.courseId) };
}

/**
 * Throws PermissionError (403) when the user has no access to the given
 * course in this workspace. Route handlers catch PermissionError and return
 * it as a JSON 403, mirroring requireRole() usage everywhere else.
 */
export async function assertCourseAccess(workspaceId: string, userId: string, courseId: string): Promise<void> {
  const scope = await getCourseAccessScope(workspaceId, userId);
  if (scope.isAdmin) return;
  if (!scope.courseIds?.includes(courseId)) {
    throw new PermissionError("You don't have access to this course");
  }
}
