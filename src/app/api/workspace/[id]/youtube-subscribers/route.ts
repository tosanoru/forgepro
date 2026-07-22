import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { fetchChannelByHandle, parseYoutubeIdentifier, fetchChannelStats } from "@/lib/youtube-data";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [ws] = await db.select({ youtubeChannelId: workspaces.youtubeChannelId, youtubeSubscriberCount: workspaces.youtubeSubscriberCount }).from(workspaces).where(eq(workspaces.id, id)).limit(1);

  return NextResponse.json({
    youtubeChannelId: ws?.youtubeChannelId ?? null,
    subscriberCount: ws?.youtubeSubscriberCount ?? null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { channelId } = body as { channelId?: string };

  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }

  const parsed = parseYoutubeIdentifier(channelId);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid YouTube channel identifier" }, { status: 400 });
  }

  let stats;
  if (parsed.type === "handle") {
    stats = await fetchChannelByHandle(parsed.value);
    if (!stats) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
  } else {
    const results = await fetchChannelStats([parsed.value]);
    if (results.length === 0) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    stats = results[0];
  }

  await db
    .update(workspaces)
    .set({ youtubeChannelId: stats.youtubeChannelId, youtubeSubscriberCount: stats.subscriberCount })
    .where(eq(workspaces.id, id));

  return NextResponse.json({
    youtubeChannelId: stats.youtubeChannelId,
    subscriberCount: stats.subscriberCount,
    title: stats.title,
    handle: stats.handle,
  });
}
