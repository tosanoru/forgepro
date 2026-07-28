import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { conversations, conversationParticipants, messages, workspaceMembers, users } from "@/db/schema";
import { requireRole } from "@/lib/permissions";
import { ensureWorkspace } from "@/lib/workspace";
import { and, eq, desc, inArray } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  let workspaceId: string;
  try {
    workspaceId = await ensureWorkspace(session.user.id, session.user.email!);
  } catch {
    return new Response("No workspace", { status: 400 });
  }

  await requireRole(workspaceId, session.user.id, "reviewer");
  const meId = session.user.id;

  const convRows = await db
    .select()
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, conversations.id),
        eq(conversationParticipants.userId, meId),
      ),
    )
    .where(eq(conversations.workspaceId, workspaceId))
    .orderBy(desc(conversations.lastMessageAt));

  const convIds = convRows.map((r) => r.conversation.id);

  if (convIds.length === 0) {
    return Response.json([]);
  }

  const [participantsRows, allMessages] = await Promise.all([
    db
      .select({
        conversationId: conversationParticipants.conversationId,
        userId: conversationParticipants.userId,
        lastReadAt: conversationParticipants.lastReadAt,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(conversationParticipants)
      .innerJoin(users, eq(users.id, conversationParticipants.userId))
      .where(inArray(conversationParticipants.conversationId, convIds)),

    db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(desc(messages.createdAt)),
  ]);

  const participantsByConv: Record<string, typeof participantsRows> = {};
  for (const p of participantsRows) {
    if (!participantsByConv[p.conversationId]) participantsByConv[p.conversationId] = [];
    participantsByConv[p.conversationId].push(p);
  }

  const lastReadMap: Record<string, Date | null> = {};
  for (const r of convRows) {
    lastReadMap[r.conversation.id] = r.conversation_participant.lastReadAt;
  }

  const result = convRows.map((r) => {
    const conv = r.conversation;
    const lr = lastReadMap[conv.id];

    const convMessages = allMessages.filter((m) => m.conversationId === conv.id);

    const lastMsg = convMessages[0];

    const unreadCount = lr
      ? convMessages.filter((m) => m.createdAt > lr).length
      : convMessages.length;

    return {
      id: conv.id,
      subject: conv.subject,
      lastMessageAt: conv.lastMessageAt.toISOString(),
      lastMessagePreview: lastMsg?.content ?? "",
      unreadCount,
      participants: (participantsByConv[conv.id] ?? []).map((p) => ({
        userId: p.userId,
        name: p.name,
        email: p.email,
        image: p.image,
        lastReadAt: p.lastReadAt?.toISOString() ?? null,
      })),
    };
  });

  return Response.json(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  let workspaceId: string;
  try {
    workspaceId = await ensureWorkspace(session.user.id, session.user.email!);
  } catch {
    return new Response("No workspace", { status: 400 });
  }

  await requireRole(workspaceId, session.user.id, "editor");

  let body: { participantIds: string[]; subject?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.participantIds?.length) {
    return new Response("participantIds required", { status: 400 });
  }

  const userId: string = session.user.id;
  const participantIds = [...new Set([userId, ...body.participantIds])];

  const members = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.userId, participantIds),
      ),
    );

  const validIds = members.map((m) => m.userId);

  const conversationId = crypto.randomUUID();

  await db.insert(conversations).values({
      id: conversationId,
      workspaceId,
      subject: body.subject ?? null,
      createdBy: userId,
    });

    for (const uid of validIds) {
      await db.insert(conversationParticipants).values({
        conversationId,
        userId: uid,
        lastReadAt: uid === userId ? new Date() : null,
      });
    }

    if (body.content) {
      await db.insert(messages).values({
        conversationId,
        senderId: userId,
        content: body.content,
      });

      await db
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }

  return Response.json({ id: conversationId }, { status: 201 });
}