import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { thumbnails, workspaceImageSettings } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { enforcePlanLimit, enforceThumbnailBudget, PlanLimitError, ThumbnailBudgetError } from "@/lib/plan-usage";
import { THUMBNAIL_COST_ESTIMATE_CENTS } from "@/lib/thumbnail-pricing";
import { decryptSecret } from "@/lib/crypto";
import { generateImage, type ImageProvider } from "@/lib/image-provider";
import { uploadObject, createDownloadUrl } from "@/lib/r2";

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

  const rows = await db.select().from(thumbnails).where(eq(thumbnails.workspaceId, workspaceId)).orderBy(desc(thumbnails.createdAt));

  // Presigned GET per thumbnail so the gallery can render images — same
  // private-bucket-plus-presigned-url approach as Brand Assets, not a
  // public bucket.
  const withUrls = await Promise.all(
    rows.map(async (t) => ({ ...t, url: await createDownloadUrl(t.r2Key) })),
  );

  return NextResponse.json({ thumbnails: withUrls });
}

/**
 * POST — the actual generation step. Unlike Video Review/Brand Assets
 * (browser uploads directly), the server generates the bytes via OpenAI
 * and pushes them to R2 itself — there's no file coming from the browser
 * to presign an upload for.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { workspaceId, prompt, contentCardId } = body as { workspaceId: string; prompt: string; contentCardId?: string };
  if (!workspaceId || !prompt?.trim()) {
    return NextResponse.json({ error: "workspaceId and prompt are required" }, { status: 400 });
  }

  try {
    await requireRole(workspaceId, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    await enforcePlanLimit(workspaceId, "thumbnailGenerationsThisMonth");
    await enforceThumbnailBudget(workspaceId);
  } catch (e) {
    if (e instanceof PlanLimitError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ThumbnailBudgetError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const [settings] = await db
    .select()
    .from(workspaceImageSettings)
    .where(eq(workspaceImageSettings.workspaceId, workspaceId))
    .limit(1);
  if (!settings) {
    return NextResponse.json({ error: "No image key connected yet — add one in Settings." }, { status: 400 });
  }

  try {
    const apiKey = decryptSecret(settings.encryptedApiKey);
    const provider: ImageProvider = (settings.imageProvider as ImageProvider) ?? "openai";
    const imageBuffer = await generateImage(apiKey, prompt.trim(), provider);

    const key = `${workspaceId}/thumbnails/${crypto.randomUUID()}.png`;
    await uploadObject(key, imageBuffer, "image/png");

    const [thumbnail] = await db
      .insert(thumbnails)
      .values({
        workspaceId,
        prompt: prompt.trim(),
        r2Key: key,
        estimatedCostCents: THUMBNAIL_COST_ESTIMATE_CENTS,
        contentCardId: contentCardId ?? null,
        createdBy: session.user.id,
      })
      .returning();

    const url = await createDownloadUrl(key);
    return NextResponse.json({ thumbnail: { ...thumbnail, url } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate thumbnail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
