import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { conversationParticipants } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, id),
        eq(conversationParticipants.userId, session.user.id),
      ),
    );

  return Response.json({ ok: true });
}