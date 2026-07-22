import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceAiSettings } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { encryptSecret } from "@/lib/crypto";

const PROVIDERS = ["anthropic", "openai", "deepseek", "minimax", "openrouter", "nvidia", "google"];

/**
 * GET — returns provider/model/whether a key is saved + its last 4 chars.
 * Never returns the key itself; there is no decrypt-and-return path here
 * or anywhere else. Generation reads the decrypted key directly via
 * resolveWorkspaceProvider() server-side, it never round-trips to a client.
 */
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

  const [row] = await db.select().from(workspaceAiSettings).where(eq(workspaceAiSettings.workspaceId, id)).limit(1);

  return NextResponse.json({
    provider: row?.provider ?? "anthropic",
    model: row?.model ?? "",
    hasKey: Boolean(row?.encryptedApiKey),
    keyLast4: row?.keyLast4 ?? null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    // Admin+ only — this key is shared by the whole workspace, same
    // reasoning as requiring admin to invite teammates.
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const { provider, apiKey, model, clearKey } = body as {
    provider: string;
    apiKey?: string;
    model?: string;
    clearKey?: boolean;
  };

  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const values = {
    workspaceId: id,
    provider,
    model: model?.trim() || null,
    updatedBy: session.user.id,
    updatedAt: new Date(),
    ...(clearKey
      ? { encryptedApiKey: null, keyLast4: null }
      : apiKey?.trim()
        ? { encryptedApiKey: encryptSecret(apiKey.trim()), keyLast4: apiKey.trim().slice(-4) }
        : {}),
  };

  await db
    .insert(workspaceAiSettings)
    .values(values)
    .onConflictDoUpdate({ target: workspaceAiSettings.workspaceId, set: values });

  return NextResponse.json({ status: "saved" });
}
