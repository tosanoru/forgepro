import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperAdmin } from "@/lib/super-admin";

/**
 * GET /api/admin/me — used by the frontend to decide whether to show the
 * Admin nav link and gate the /admin page. Deliberately not read from the
 * JWT session token: this app uses JWT sessions (see auth.ts), and a
 * claim baked into a JWT at sign-in would still say `true` after an
 * admin is revoked, until that token expires. This hits the DB fresh
 * every time instead, same as every other admin route.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ isSuperAdmin: false });
  return NextResponse.json({ isSuperAdmin: await isSuperAdmin(session.user.id) });
}
