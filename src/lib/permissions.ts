import "server-only";
import { ROLE_RANK, type WorkspaceRole } from "@/lib/workspace-types";
import { getWorkspaceRole } from "@/lib/workspace";

/**
 * The one policy function every module (video review, brand assets, script
 * writing, revenue dashboard, ...) should call before touching workspace
 * data. See FORGE-2-ARCHITECTURE.md §4 — the explicit goal is that no
 * module grows its own bespoke permission checks.
 *
 * Usage in an API route:
 *   const role = await getWorkspaceRole(workspaceId, session.user.id);
 *   if (!can(role, "editor")) return new Response("Forbidden", { status: 403 });
 *
 * `can` checks *at least* the given role by rank (owner > admin > editor >
 * reviewer > client_viewer). For actions that need an exact role rather
 * than a minimum (e.g. "only client_viewer can see the approval-only view"),
 * compare `role` directly instead of using this helper.
 */
export function can(role: WorkspaceRole | null, minimum: WorkspaceRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/**
 * Convenience wrapper for API routes: resolves the caller's role in one
 * workspace and throws a Response-shaped error object if they don't meet
 * the minimum. Keeps route handlers to one line for the common case.
 */
export async function requireRole(
  workspaceId: string,
  userId: string,
  minimum: WorkspaceRole,
): Promise<WorkspaceRole> {
  const role = await getWorkspaceRole(workspaceId, userId);
  if (!can(role, minimum)) {
    throw new PermissionError(`Requires ${minimum}+ in workspace ${workspaceId}`);
  }
  return role as WorkspaceRole;
}

export class PermissionError extends Error {
  status = 403 as const;
}
