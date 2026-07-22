import { NextResponse } from "next/server";
import { eq, asc, gte, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { channelSnapshots } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

/** GET .../history?workspaceId=...&days=90 — time-series snapshots for charting. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(channelSnapshots)
    .where(and(eq(channelSnapshots.channelId, id), gte(channelSnapshots.snapshotDate, since)))
    .orderBy(asc(channelSnapshots.snapshotDate));

  return NextResponse.json({ snapshots: rows });
}
