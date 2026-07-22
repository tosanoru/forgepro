import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspacePaymentSettings } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { encryptSecret } from "@/lib/crypto";
import { PAYMENT_PROVIDER_ADAPTERS, isPaymentProvider } from "@/lib/payment-providers";

function badProvider(provider: string) {
  return NextResponse.json({ error: `Unknown payment provider: ${provider}` }, { status: 400 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; provider: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, provider } = await params;
  if (!isPaymentProvider(provider)) return badProvider(provider);

  try {
    await requireRole(id, session.user.id, "reviewer");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [row] = await db
    .select()
    .from(workspacePaymentSettings)
    .where(and(eq(workspacePaymentSettings.workspaceId, id), eq(workspacePaymentSettings.provider, provider)))
    .limit(1);

  return NextResponse.json({ connected: Boolean(row), keyLast4: row?.keyLast4 ?? null });
}

/** POST — validates the key against the provider's API before saving, same as the original Stripe-only route did. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; provider: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, provider } = await params;
  if (!isPaymentProvider(provider)) return badProvider(provider);

  try {
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const body = await req.json();
  const { apiKey } = body as { apiKey: string };
  if (!apiKey?.trim()) return NextResponse.json({ error: "apiKey is required" }, { status: 400 });

  try {
    await PAYMENT_PROVIDER_ADAPTERS[provider].verify(apiKey.trim());
  } catch {
    return NextResponse.json({ error: `${provider} rejected this key — double check it's a valid secret key.` }, { status: 400 });
  }

  const values = {
    workspaceId: id,
    provider,
    encryptedApiKey: encryptSecret(apiKey.trim()),
    keyLast4: apiKey.trim().slice(-4),
    connectedBy: session.user.id,
    connectedAt: new Date(),
  };

  await db
    .insert(workspacePaymentSettings)
    .values(values)
    .onConflictDoUpdate({ target: [workspacePaymentSettings.workspaceId, workspacePaymentSettings.provider], set: values });

  return NextResponse.json({ status: "connected" });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; provider: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, provider } = await params;
  if (!isPaymentProvider(provider)) return badProvider(provider);

  try {
    await requireRole(id, session.user.id, "admin");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  await db
    .delete(workspacePaymentSettings)
    .where(and(eq(workspacePaymentSettings.workspaceId, id), eq(workspacePaymentSettings.provider, provider)));

  return NextResponse.json({ status: "disconnected" });
}
