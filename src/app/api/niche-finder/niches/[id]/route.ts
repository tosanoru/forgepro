import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { niches, nicheChannels, channels, channelSnapshots } from "@/db/schema";
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

  const [niche] = await db.select().from(niches).where(eq(niches.id, id)).limit(1);
  if (!niche) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Top 10 channels in this niche, most recent snapshot each — a simple
  // join + per-channel latest-snapshot subquery would be more efficient
  // at scale, but with a niche capped to a modest channel count this
  // straightforward version is plenty for v1.
  const channelRows = await db
    .select({ channel: channels })
    .from(nicheChannels)
    .innerJoin(channels, eq(nicheChannels.channelId, channels.id))
    .where(eq(nicheChannels.nicheId, id))
    .limit(10);

  const topChannels = await Promise.all(
    channelRows.map(async ({ channel }) => {
      const [latestSnapshot] = await db
        .select()
        .from(channelSnapshots)
        .where(eq(channelSnapshots.channelId, channel.id))
        .orderBy(desc(channelSnapshots.snapshotDate))
        .limit(1);
      return { ...channel, latestSnapshot: latestSnapshot ?? null };
    }),
  );

  return NextResponse.json({ niche, channels: topChannels });
}
