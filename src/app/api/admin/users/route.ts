import { NextResponse } from "next/server";
import { eq, ilike, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, workspaces } from "@/db/schema";
import { requireSuperAdmin, SuperAdminError } from "@/lib/super-admin";

/**
 * GET /api/admin/users?query=... — platform-wide, not scoped to any one
 * workspace (this is the whole point of a super admin view). `query`
 * matches against email or name, case-insensitive substring — good
 * enough at the scale a single-operator agency tool actually runs at;
 * revisit with a real search index if the user base ever gets large
 * enough for ILIKE table scans to matter.
 */
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
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      isSuperAdmin: users.isSuperAdmin,
      createdAt: users.createdAt,
      // Workspaces this user OWNS, not every workspace they're a member
      // of — ownership is the meaningful count for an admin triaging
      // "who has how many workspaces on the platform", membership on
      // others' workspaces is much noisier.
      ownedWorkspaceCount: sql<number>`(select count(*) from ${workspaces} where ${workspaces.ownerId} = ${users.id})`,
    })
    .from(users)
    .where(query ? or(ilike(users.email, `%${query}%`), ilike(users.name, `%${query}%`)) : undefined)
    .orderBy(users.createdAt);

  return NextResponse.json({ users: rows });
}
