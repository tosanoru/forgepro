import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { scripts } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { generateText } from "@/lib/ai-provider";

const ANALYZE_SYSTEM_PROMPT = `You are a thumbnail prompt engineer. Given a video script, your job is to distill it into one concise image-generation prompt (max 200 words) that captures the single most visually compelling moment.

Rules:
- Focus on the key scene, character expression, visual style, color palette, composition, and any text overlay that should appear.
- Use descriptive visual language — lighting, angle, framing, emotion.
- Do NOT include dialogue, narration, or narrative pacing. This is a static image.
- Output only the prompt, nothing else.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { workspaceId, scriptId } = body as { workspaceId: string; scriptId: string };
  if (!workspaceId || !scriptId) {
    return NextResponse.json({ error: "workspaceId and scriptId are required" }, { status: 400 });
  }

  try {
    await requireRole(workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [script] = await db
    .select()
    .from(scripts)
    .where(eq(scripts.id, scriptId))
    .limit(1);

  if (!script) return NextResponse.json({ error: "Script not found" }, { status: 404 });
  if (script.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Script does not belong to this workspace" }, { status: 403 });
  }

  try {
    const optimizedPrompt = await generateText({
      workspaceId,
      systemPrompt: ANALYZE_SYSTEM_PROMPT,
      userPrompt: `Title: ${script.title}\n\nScript:\n${script.content}`,
      maxTokens: 500,
    });

    return NextResponse.json({ prompt: optimizedPrompt.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to analyze script";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
