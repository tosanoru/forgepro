import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { workspacePaymentSettings, revenueEntries } from "@/db/schema";
import { requireRole, PermissionError } from "@/lib/permissions";
import { decryptSecret } from "@/lib/crypto";
import { PAYMENT_PROVIDER_ADAPTERS, isPaymentProvider } from "@/lib/payment-providers";

/**
 * POST — pulls the last 90 days of transactions from whichever provider
 * and upserts as revenue_entries rows. Same idempotent-by-externalId
 * pattern regardless of provider; only the fetch call differs, and that's
 * dispatched through PAYMENT_PROVIDER_ADAPTERS rather than branched here.
 *
 * Manual "sync now" only, same as the original Stripe-only route — no
 * background job wiring in this pass (see CLAUDE.md gaps).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; provider: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, provider } = await params;
  if (!isPaymentProvider(provider)) {
    return NextResponse.json({ error: `Unknown payment provider: ${provider}` }, { status: 400 });
  }

  try {
    await requireRole(id, session.user.id, "editor");
  } catch (e) {
    if (e instanceof PermissionError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const [settings] = await db
    .select()
    .from(workspacePaymentSettings)
    .where(and(eq(workspacePaymentSettings.workspaceId, id), eq(workspacePaymentSettings.provider, provider)))
    .limit(1);

  if (!settings) {
    return NextResponse.json({ error: `${provider} isn't connected for this workspace yet.` }, { status: 400 });
  }

  try {
    const apiKey = decryptSecret(settings.encryptedApiKey);
    const rows = await PAYMENT_PROVIDER_ADAPTERS[provider].fetchRecent(apiKey, 90);

    for (const row of rows) {
      await db
        .insert(revenueEntries)
        .values({
          workspaceId: id,
          source: provider,
          description: row.description,
          amountCents: row.amountCents,
          currency: row.currency,
          occurredOn: row.occurredOn,
          externalId: row.externalId,
          createdBy: session.user.id,
        })
        .onConflictDoNothing({ target: [revenueEntries.workspaceId, revenueEntries.source, revenueEntries.externalId] });
    }

    return NextResponse.json({ status: "synced", count: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to sync ${provider}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
