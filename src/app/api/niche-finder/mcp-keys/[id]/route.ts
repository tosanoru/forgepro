import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { mcpApiKeys } from "@/db/schema";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // No requireRole() here — this is a user-scoped resource (see
  // schema.ts), so ownership (userId match) IS the permission check,
  // the same way workspace membership is the check everywhere else.
  const result = await db
    .delete(mcpApiKeys)
    .where(and(eq(mcpApiKeys.id, id), eq(mcpApiKeys.userId, session.user.id)))
    .returning();

  if (result.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ status: "revoked" });
}
