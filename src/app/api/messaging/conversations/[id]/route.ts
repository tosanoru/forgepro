import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { conversations, conversationParticipants, messages, users } from "@/db/schema";
import { requireRole } from "@/lib/permissions";
import { ensureWorkspace } from "@/lib/workspace";
import { and, eq, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
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

  await requireRole(workspaceId, session.user.id, "reviewer");

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

  const participantRows = await db
    .select({
      userId: conversationParticipants.userId,
      lastReadAt: conversationParticipants.lastReadAt,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(conversationParticipants)
    .innerJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversationParticipants.conversationId, id));

  const messageRows = await db
    .select({
      id: messages.id,
      content: messages.content,
      senderId: messages.senderId,
      createdAt: messages.createdAt,
      senderName: users.name,
      senderEmail: users.email,
      senderImage: users.image,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.conversationId, id))
    .orderBy(desc(messages.createdAt));

  return Response.json({
    id: conv.id,
    subject: conv.subject,
    participants: participantRows.map((p) => ({
      userId: p.userId,
      name: p.name,
      email: p.email,
      image: p.image,
      lastReadAt: p.lastReadAt?.toISOString() ?? null,
    })),
    messages: messageRows.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      createdAt: m.createdAt.toISOString(),
      sender: { name: m.senderName, email: m.senderEmail, image: m.senderImage },
    })),
  });
}