import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { scripts, contentCards } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { enforcePlanLimit, PlanLimitError } from "@/lib/plan-usage";
import { streamText, ProviderApiError } from "@/lib/ai-provider";
import { getScriptSystemPrompt } from "@/lib/script-prompts";
import type { ContentFormat } from "@/lib/content-types";

/** GET /api/scripts?workspaceId=... — list scripts for a workspace */
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
    .select()
    .from(scripts)
    .where(eq(scripts.workspaceId, workspaceId))
    .orderBy(desc(scripts.updatedAt));

  return NextResponse.json({ scripts: rows });
}

/**
 * POST /api/scripts — generate a new script via AI and save it in one step.
 * Body: { workspaceId, topic, title?, format?, contentCardId? }
 *
 * `format` picks which system prompt runs (see script-prompts.ts) — short
 * and long-form are structurally different scripts, not the same prompt
 * at different lengths. Defaults to "long" if omitted.
 *
 * `contentCardId` is optional: when generating from a content card's
 * detail dialog, the card's own `format` is passed straight through
 * (client-side, see content/page.tsx) so the script matches what the
 * card was already planned as, and this route auto-attaches the result
 * back to that card via the same exclusive-claim logic as
 * /api/content/attach — one write instead of generate-then-separately-attach.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id; // captured once, plain string — narrowing through session.user.id doesn't reliably persist into the closure below

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { workspaceId, topic, title, format, scriptStyle, contentCardId } = body as {
    workspaceId: string;
    topic: string;
    title?: string;
    format?: ContentFormat;
    scriptStyle?: string;
    contentCardId?: string;
  };

  if (!workspaceId || !topic?.trim()) {
    return NextResponse.json({ error: "workspaceId and topic are required" }, { status: 400 });
  }
  const resolvedFormat: ContentFormat = format === "short" ? "short" : "long";

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

  // SSE, not a single JSON response — script drafts run ~1500-3000 tokens
  // for long-form, which is long enough that a blocking spinner feels
  // broken even though it technically isn't. Every event is a JSON object
  // on its own `data:` line so the client never has to guess where one
  // event ends and the next begins:
  //   {"delta": "..."}   — one text chunk, in generation order
  //   {"done": true, "script": {...}}   — final event, stream closes after this
  //   {"error": "..."}   — generation failed partway through; nothing was saved
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let content = "";
      try {
        for await (const delta of streamText({
          workspaceId,
          systemPrompt: getScriptSystemPrompt(resolvedFormat, scriptStyle),
          userPrompt: `Video topic / brief: ${topic.trim()}`,
          maxTokens: resolvedFormat === "short" ? 800 : 3000,
        })) {
          content += delta;
          send({ delta });
        }

        // Nothing is written to the DB until generation fully completes —
        // a connection drop or provider error mid-stream means no partial
        // script row is left behind, same "all or nothing" guarantee the
        // old blocking version had for free.
        const [script] = await db
          .insert(scripts)
          .values({
            workspaceId,
            title: title?.trim() || topic.trim().slice(0, 80),
            topic: topic.trim(),
            format: resolvedFormat,
            scriptStyle: scriptStyle ?? null,
            content,
            createdBy: userId,
          })
          .returning();

        if (contentCardId) {
          await db.transaction(async (tx) => {
            await tx.update(contentCards).set({ scriptId: null, updatedAt: new Date() }).where(eq(contentCards.scriptId, script.id));
            await tx.update(contentCards).set({ scriptId: script.id, updatedAt: new Date() }).where(eq(contentCards.id, contentCardId));
          });
        }

        send({ done: true, script });
      } catch (err: unknown) {
        const message = err instanceof ProviderApiError ? err.message : err instanceof Error ? err.message : "Unknown error";
        send({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
