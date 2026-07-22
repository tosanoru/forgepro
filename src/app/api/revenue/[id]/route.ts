import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { revenueEntries } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [entry] = await db.select().from(revenueEntries).where(eq(revenueEntries.id, id)).limit(1);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await requireRole(entry.workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  // Synced rows (from any payment provider) are intentionally not
  // deletable — deleting one just has it reappear on the next sync
  // (upsert on externalId), which is confusing. Manual entries
  // (externalId null, source youtube_adsense/sponsorship/other) delete cleanly.
  if (entry.externalId) {
    return NextResponse.json({ error: `${entry.source}-synced entries can't be deleted — they'll just resync.` }, { status: 400 });
  }

  await db.delete(revenueEntries).where(eq(revenueEntries.id, id));
  return NextResponse.json({ status: "deleted" });
}
