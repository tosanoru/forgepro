import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspaceImageSettings } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { encryptSecret } from "@/lib/crypto";
import { verifyImageKey, type ImageProvider } from "@/lib/image-provider";

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

  const [row] = await db.select().from(workspaceImageSettings).where(eq(workspaceImageSettings.workspaceId, id)).limit(1);
  return NextResponse.json({
    connected: Boolean(row),
    provider: row?.imageProvider ?? "openai",
    keyLast4: row?.keyLast4 ?? null,
    monthlyBudgetCents: row?.monthlyBudgetCents ?? null,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { monthlyBudgetCents } = body as { monthlyBudgetCents: number | null };
  if (monthlyBudgetCents !== null && (typeof monthlyBudgetCents !== "number" || monthlyBudgetCents < 0)) {
    return NextResponse.json({ error: "monthlyBudgetCents must be a non-negative number, or null to remove the budget" }, { status: 400 });
  }

  const [row] = await db.select().from(workspaceImageSettings).where(eq(workspaceImageSettings.workspaceId, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Connect an image key first" }, { status: 400 });

  await db.update(workspaceImageSettings).set({ monthlyBudgetCents }).where(eq(workspaceImageSettings.workspaceId, id));
  return NextResponse.json({ monthlyBudgetCents });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { apiKey, provider } = body as { apiKey: string; provider?: ImageProvider };
  if (!apiKey?.trim()) return NextResponse.json({ error: "apiKey is required" }, { status: 400 });

  const imageProvider: ImageProvider = provider ?? "openai";

  try {
    await verifyImageKey(apiKey.trim(), imageProvider);
  } catch {
    const label = { openai: "OpenAI", google: "Google/Gemini", nvidia: "Nvidia NIM" }[imageProvider] ?? "Provider";
    return NextResponse.json({ error: `${label} rejected this key — double check it's a valid secret key.` }, { status: 400 });
  }

  const values = {
    workspaceId: id,
    imageProvider,
    encryptedApiKey: encryptSecret(apiKey.trim()),
    keyLast4: apiKey.trim().slice(-4),
    connectedBy: session.user.id,
    connectedAt: new Date(),
  };

  await db
    .insert(workspaceImageSettings)
    .values(values)
    .onConflictDoUpdate({ target: workspaceImageSettings.workspaceId, set: values });

  return NextResponse.json({ status: "connected", provider: imageProvider });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await db.delete(workspaceImageSettings).where(eq(workspaceImageSettings.workspaceId, id));
  return NextResponse.json({ status: "disconnected" });
}
