import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { scripts } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { enforcePlanLimit, PlanLimitError } from "@/lib/plan-usage";
import type { ContentFormat } from "@/lib/content-types";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { workspaceId, title, topic, format, scriptStyle, content } = body as {
    workspaceId: string;
    title: string;
    topic: string;
    format?: ContentFormat;
    scriptStyle?: string;
    content?: string;
  };

  if (!workspaceId || !title?.trim()) {
    return NextResponse.json({ error: "workspaceId and title are required" }, { status: 400 });
  }

  try {
    await requireRole(workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    await enforcePlanLimit(workspaceId, "scriptGenerationsThisMonth");
  } catch (e) {
    if (e instanceof PlanLimitError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const resolvedFormat: ContentFormat = format === "short" ? "short" : "long";

  const [script] = await db
    .insert(scripts)
    .values({
      workspaceId,
      title: title.trim(),
      topic: topic?.trim() || title.trim(),
      format: resolvedFormat,
      scriptStyle: scriptStyle ?? null,
      content: content ?? "",
      createdBy: session.user.id,
    })
    .returning();

  return NextResponse.json({ script }, { status: 201 });
}
