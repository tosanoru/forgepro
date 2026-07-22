import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { channels, channelSnapshots } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [latestSnapshot] = await db
    .select()
    .from(channelSnapshots)
    .where(eq(channelSnapshots.channelId, id))
    .orderBy(desc(channelSnapshots.snapshotDate))
    .limit(1);

  return NextResponse.json({ channel, latestSnapshot: latestSnapshot ?? null });
}
