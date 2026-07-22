export type ContentFormat = "short" | "long";

/**
 * Ported from Forge's PipelineStage with one addition: IDEA at the front.
 * Forge's board started at SCRIPT because Forge assumed every card began
 * with AI-generated script fields; Content Planning needs a stage before
 * that, for ideas that haven't been scripted yet.
 */
export type ContentStage =
  | "IDEA"
  | "SCRIPT"
  | "PREPRODUCTION"
  | "PRODUCTION"
  | "POST_PRODUCTION"
  | "IN_REVIEW"
  | "PUBLISHED";

export const CONTENT_STAGES: ContentStage[] = [
  "IDEA",
  "SCRIPT",
  "PREPRODUCTION",
  "PRODUCTION",
  "POST_PRODUCTION",
  "IN_REVIEW",
  "PUBLISHED",
];

export const CONTENT_STAGE_LABELS: Record<ContentStage, string> = {
  IDEA: "Idea",
  SCRIPT: "Script",
  PREPRODUCTION: "Pre-Production",
  PRODUCTION: "Production",
  POST_PRODUCTION: "Post-Production",
  IN_REVIEW: "In Review",
  PUBLISHED: "Published",
};

export interface ContentCardMember {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface ContentCard {
  id: string;
  workspaceId: string;
  name: string;
  format: ContentFormat;
  stage: ContentStage;
  notes: string;
  stageDates: Record<string, string>;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: ContentCardMember | null;
  scriptId: string | null;
  videoId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Ported from Forge's daysUntil() — unchanged, no product-specific logic. */
export function daysUntil(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
