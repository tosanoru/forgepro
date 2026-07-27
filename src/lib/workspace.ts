import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { workspaces, workspaceMembers, workspaceInvites, users } from "@/db/schema";
import type { WorkspaceMember, WorkspaceRole, WorkspaceSummary } from "@/lib/workspace-types";

/**
 * Resolves (and lazily creates) the current user's top-level workspace.
 *
 * Ported from Forge's ensureWorkspace (src/lib/workspace.ts) with one
 * change: the created workspace defaults to type "creator" and an empty
 * branding object. Child (client) workspaces are never auto-created here —
 * see createChildWorkspace() below, which is a deliberate action an agency
 * owner/admin takes, not something that happens implicitly.
 */
export async function ensureWorkspace(userId: string, email: string): Promise<string> {
  const pending = await db
    .select()
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.email, email), eq(workspaceInvites.status, "pending")));

  for (const invite of pending) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: invite.workspaceId, userId, role: invite.role })
      .onConflictDoNothing();
    await db.update(workspaceInvites).set({ status: "accepted" }).where(eq(workspaceInvites.id, invite.id));
  }

  const existing = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.joinedAt)
    .limit(1);

  if (existing.length > 0) return existing[0].workspaceId;

  const [ws] = await db
    .insert(workspaces)
    .values({ name: "My Workspace", type: "creator", ownerId: userId })
    .returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId, role: "owner" });
  return ws.id;
}

/**
 * Creates a client sub-workspace under an existing (usually "agency")
 * workspace. Caller must already be owner/admin of the parent — checked by
 * the API route via requireRole() before this is called, not re-checked
 * here, since this is a low-level DB helper other server code may compose.
 */
export async function createChildWorkspace(params: {
  parentWorkspaceId: string;
  name: string;
  ownerId: string; // usually the agency owner, unless the client gets their own login
}): Promise<WorkspaceSummary> {
  const [parent] = await db.select().from(workspaces).where(eq(workspaces.id, params.parentWorkspaceId)).limit(1);
  if (!parent) throw new Error("Parent workspace not found");

  const [child] = await db
    .insert(workspaces)
    .values({
      name: params.name,
      type: "client",
      parentWorkspaceId: params.parentWorkspaceId,
      ownerId: params.ownerId,
      branding: parent.branding, // inherit agency branding by default (white-label)
    })
    .returning();

  await db.insert(workspaceMembers).values({ workspaceId: child.id, userId: params.ownerId, role: "owner" });

  return toSummary(child);
}

/** All workspaces this user directly belongs to (their own + any client workspaces they're on). */
export async function getUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));
  return rows.map((r) => toSummary(r.workspace));
}

/** Direct child (client) workspaces of an agency workspace — one level, not recursive. */
export async function getChildWorkspaces(parentWorkspaceId: string): Promise<WorkspaceSummary[]> {
  const rows = await db.select().from(workspaces).where(eq(workspaces.parentWorkspaceId, parentWorkspaceId));
  return rows.map(toSummary);
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceSummary | null> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  return ws ? toSummary(ws) : null;
}

export async function getWorkspaceRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  return rows as WorkspaceMember[];
}

/** Top-level workspaces only (no parent) — used for an agency switcher UI, excludes client workspaces. */
export async function getTopLevelWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.parentWorkspaceId)));
  return rows.map((r) => toSummary(r.workspace));
}

export async function createTopLevelWorkspace(params: {
  name: string;
  ownerId: string;
  type?: "creator" | "agency" | "org";
}): Promise<WorkspaceSummary> {
  const [ws] = await db
    .insert(workspaces)
    .values({ name: params.name, type: params.type ?? "creator", ownerId: params.ownerId })
    .returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: params.ownerId, role: "owner" });
  return toSummary(ws);
}

export async function updateWorkspace(workspaceId: string, data: { name?: string }): Promise<WorkspaceSummary | null> {
  const [ws] = await db.update(workspaces).set(data).where(eq(workspaces.id, workspaceId)).returning();
  return ws ? toSummary(ws) : null;
}

function toSummary(ws: typeof workspaces.$inferSelect): WorkspaceSummary {
  return {
    id: ws.id,
    name: ws.name,
    type: ws.type,
    parentWorkspaceId: ws.parentWorkspaceId,
    ownerId: ws.ownerId,
    branding: ws.branding ?? {},
    youtubeChannelId: ws.youtubeChannelId,
    youtubeSubscriberCount: ws.youtubeSubscriberCount,
    createdAt: ws.createdAt.toISOString(),
  };
}
