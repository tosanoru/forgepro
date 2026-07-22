import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { brandAssets } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { enforcePlanLimit, PlanLimitError } from "@/lib/plan-usage";
import { createUploadUrl } from "@/lib/r2";

/**
 * Allowlist, not a denylist — safer default for a DAM that accepts
 * whatever an agency wants to store. Covers what a creative/marketing
 * team actually uploads: images, video, audio, documents, fonts, and
 * zipped bundles. Deliberately excludes executables and scripts
 * (.exe/.sh/.bat/etc.) — nothing in Brand Assets should ever need to be
 * one, and there's no reason to accept the risk of hosting one.
 */
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "font/"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/postscript", // .ai/.eps
  "application/vnd.adobe.photoshop",
]);
const MAX_FILE_SIZE_MB = 250;

function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p)) || ALLOWED_MIME_TYPES.has(mimeType);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const rows = await db.select().from(brandAssets).where(eq(brandAssets.workspaceId, id)).orderBy(desc(brandAssets.createdAt));
  return NextResponse.json({ assets: rows });
}

/**
 * POST — creates the DB row and a presigned upload URL in one step, same
 * pattern as video upload (src/app/api/workspace/[id]/videos/route.ts):
 * browser PUTs directly to R2 using the returned URL, we never touch the
 * file bytes.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const body = await req.json();
  const { name, folder, mimeType, sizeBytes } = body as {
    name: string;
    folder?: string;
    mimeType: string;
    sizeBytes: number;
  };
  if (!name?.trim() || !mimeType || typeof sizeBytes !== "number") {
    return NextResponse.json({ error: "name, mimeType, and sizeBytes are required" }, { status: 400 });
  }
  if (!isAllowedMimeType(mimeType)) {
    return NextResponse.json({ error: `File type "${mimeType}" isn't allowed. Images, video, audio, fonts, PDFs, Office docs, and zips only.` }, { status: 400 });
  }
  const sizeMB = sizeBytes / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    return NextResponse.json({ error: `File is ${sizeMB.toFixed(0)}MB — the per-file limit is ${MAX_FILE_SIZE_MB}MB.` }, { status: 400 });
  }

  try {
    await requireRole(id, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  try {
    await enforcePlanLimit(id, "brandAssetStorageMB", sizeMB);
  } catch (e) {
    if (e instanceof PlanLimitError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const key = `${id}/${crypto.randomUUID()}-${name.trim().replace(/[^\w.\-]/g, "_")}`;

  try {
    const uploadUrl = await createUploadUrl(key, mimeType);

    const [asset] = await db
      .insert(brandAssets)
      .values({
        workspaceId: id,
        name: name.trim(),
        folder: folder?.trim() || "General",
        r2Key: key,
        mimeType,
        sizeBytes,
        uploadedBy: session.user.id,
      })
      .returning();

    return NextResponse.json({ asset, uploadUrl }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
