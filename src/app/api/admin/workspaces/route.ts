import { NextResponse } from "next/server";
import { ilike, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces, users, workspaceMembers } from "@/db/schema";
import { requireSuperAdmin, SuperAdminError } from "@/lib/super-admin";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof SuperAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const query = new URL(req.url).searchParams.get("query")?.trim();

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      type: workspaces.type,
      plan: workspaces.plan,
      parentWorkspaceId: workspaces.parentWorkspaceId,
      ownerId: workspaces.ownerId,
      ownerEmail: users.email,
      ownerName: users.name,
      createdAt: workspaces.createdAt,
      memberCount: sql<number>`(select count(*) from ${workspaceMembers} where ${workspaceMembers.workspaceId} = ${workspaces.id})`,
    })
    .from(workspaces)
    .innerJoin(users, sql`${users.id} = ${workspaces.ownerId}`)
    .where(query ? or(ilike(workspaces.name, `%${query}%`), ilike(users.email, `%${query}%`)) : undefined)
    .orderBy(workspaces.createdAt);

  return NextResponse.json({ workspaces: rows });
}
