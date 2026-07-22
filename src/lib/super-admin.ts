import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export class SuperAdminError extends Error {
  status = 403 as const;
  constructor(message = "Super admin access required") {
    super(message);
  }
}

/**
 * Bootstrap problem: granting super admin only through the /admin
 * dashboard means nobody can ever grant the *first* one — there's no
 * super admin yet to click the button. SUPER_ADMIN_EMAILS (comma-
 * separated) solves that: anyone whose email is in that env var counts
 * as a super admin regardless of their `isSuperAdmin` DB flag, in
 * addition to anyone the flag is actually set for. Set it once at deploy
 * time for the founder account(s), then use the dashboard for everyone
 * granted afterward — the env var is a bootstrap mechanism, not meant to
 * be the ongoing way admins get added.
 */
function envSuperAdmins(): Set<string> {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const [user] = await db.select({ email: users.email, isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return false;
  return user.isSuperAdmin || envSuperAdmins().has(user.email.toLowerCase());
}

export async function requireSuperAdmin(userId: string): Promise<void> {
  if (!(await isSuperAdmin(userId))) throw new SuperAdminError();
}
