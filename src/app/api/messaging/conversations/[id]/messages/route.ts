import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { conversations, conversationParticipants, messages } from "@/db/schema";
import { requireRole } from "@/lib/permissions";
import { ensureWorkspace } from "@/lib/workspace";
import { and, eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  let workspaceId: string;
  try {
    workspaceId = await ensureWorkspace(session.user.id, session.user.email!);
  } catch {
    return new Response("No workspace", { status: 400 });
  }

  await requireRole(workspaceId, session.user.id, "editor");

  const { id } = await params;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.workspaceId, workspaceId)))
    .limit(1);

  if (!conv) return new Response("Not found", { status: 404 });

  const [participation] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, id),
        eq(conversationParticipants.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!participation) return new Response("Not found", { status: 404 });

  let body: { content: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.content?.trim()) {
    return new Response("Content required", { status: 400 });
  }

  const senderId: string = session.user.id;

  await db.insert(messages).values({
      conversationId: id,
      senderId,
      content: body.content.trim(),
    });

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, id));

  return Response.json({ ok: true }, { status: 201 });
}