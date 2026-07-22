import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireSuperAdmin, SuperAdminError } from "@/lib/super-admin";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireSuperAdmin(session.user.id);
  } catch (e) {
    if (e instanceof SuperAdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const { id } = await params;
  const body = await req.json();
  const { isSuperAdmin } = body as { isSuperAdmin: boolean };
  if (typeof isSuperAdmin !== "boolean") {
    return NextResponse.json({ error: "isSuperAdmin must be a boolean" }, { status: 400 });
  }

  // Self-revocation is allowed deliberately — if someone wants to step
  // down as super admin, blocking that would mean either they're stuck
  // with the role forever or someone else has to remember to do it for
  // them. It DOES mean a lone super admin can lock themselves out if
  // they're the only one and they revoke themselves — same risk any
  // single-admin system has, and why SUPER_ADMIN_EMAILS exists as a
  // recovery path (see super-admin.ts): removing their own DB flag
  // doesn't remove them if their email is still in that env var.
  const [updated] = await db.update(users).set({ isSuperAdmin }).where(eq(users.id, id)).returning({ id: users.id, isSuperAdmin: users.isSuperAdmin });
  if (!updated) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ user: updated });
}
