import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { userTrackedChannels, channels, workspaces } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { meetsTier } from "@/lib/plan-limits";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  try {
    await requireRole(workspaceId, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const rows = await db
    .select({ tracked: userTrackedChannels, channel: channels })
    .from(userTrackedChannels)
    .innerJoin(channels, eq(userTrackedChannels.channelId, channels.id))
    .where(eq(userTrackedChannels.workspaceId, workspaceId))
    .orderBy(desc(userTrackedChannels.createdAt));

  return NextResponse.json({ tracked: rows.map((r) => ({ ...r.tracked, channel: r.channel })) });
}

/** POST — track a channel. Requires channelId (an existing Niche Finder channel row, not a raw YouTube ID). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { workspaceId, channelId } = body as { workspaceId: string; channelId: string };
  if (!workspaceId || !channelId) {
    return NextResponse.json({ error: "workspaceId and channelId are required" }, { status: 400 });
  }

  try {
    await requireRole(workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!meetsTier(workspace?.plan ?? "free", "lite")) {
    return NextResponse.json({ error: "Channel tracking requires a Lite or Pro plan." }, { status: 403 });
  }

  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const [tracked] = await db
    .insert(userTrackedChannels)
    .values({ workspaceId, channelId, trackedBy: session.user.id })
    .onConflictDoNothing({ target: [userTrackedChannels.workspaceId, userTrackedChannels.channelId] })
    .returning();

  return NextResponse.json({ tracked: tracked ?? null }, { status: 201 });
}
