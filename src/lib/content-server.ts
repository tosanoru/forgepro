import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentCards } from "@/db/schema";
import type { ContentCard, ContentCardMember } from "@/lib/content-types";

type ContentCardRow = typeof contentCards.$inferSelect;

export function mapCard(row: ContentCardRow, membersById: Map<string, ContentCardMember>): ContentCard {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    format: row.format,
    stage: row.stage,
    notes: row.notes,
    stageDates: row.stageDates ?? {},
    dueDate: row.dueDate,
    assigneeId: row.assigneeId,
    assignee: row.assigneeId ? (membersById.get(row.assigneeId) ?? null) : null,
    scriptId: row.scriptId,
    videoId: row.videoId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Fetches a card and verifies it belongs to the given workspace — never trust the :id alone. */
export async function getWorkspaceCard(workspaceId: string, cardId: string) {
  const [row] = await db
    .select()
    .from(contentCards)
    .where(and(eq(contentCards.id, cardId), eq(contentCards.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}
