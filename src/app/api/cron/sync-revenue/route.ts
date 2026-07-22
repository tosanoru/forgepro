import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspacePaymentSettings, revenueEntries } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { PAYMENT_PROVIDER_ADAPTERS, type PaymentProvider } from "@/lib/payment-providers";
import { checkCronAuth } from "@/lib/cron-auth";

/**
 * GET /api/cron/sync-revenue — the scheduled-sync fix called for in
 * CLAUDE.md. There's no Trigger.dev wiring in this codebase (that's a
 * bigger infrastructure lift than this pass covers — a job queue, worker
 * process, retry semantics), so this takes the pragmatic middle ground:
 * one endpoint, protected by a shared secret, that any external scheduler
 * can hit on a timer. Vercel Cron is the obvious fit (see vercel.json —
 * add one if deploying there), but this works identically from GitHub
 * Actions, cron-job.org, or a manual curl.
 *
 * Deliberately NOT session-authenticated (a cron job has no user to log
 * in as) — CRON_SECRET is the only gate. Runs across every workspace with
 * a connected provider in one pass rather than one call per workspace, so
 * a single scheduled trigger covers the whole app.
 */
export async function GET(req: Request) {
  const authError = checkCronAuth(req);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  const connections = await db.select().from(workspacePaymentSettings);

  const results: Array<{ workspaceId: string; provider: PaymentProvider; synced: number; error?: string }> = [];

  for (const conn of connections) {
    const provider = conn.provider as PaymentProvider;
    try {
      const apiKey = decryptSecret(conn.encryptedApiKey);
      const rows = await PAYMENT_PROVIDER_ADAPTERS[provider].fetchRecent(apiKey, 90);

      for (const row of rows) {
        await db
          .insert(revenueEntries)
          .values({
            workspaceId: conn.workspaceId,
            source: provider,
            description: row.description,
            amountCents: row.amountCents,
            currency: row.currency,
            occurredOn: row.occurredOn,
            externalId: row.externalId,
            createdBy: conn.connectedBy, // cron has no acting user — attribute to whoever connected the provider
          })
          .onConflictDoNothing({ target: [revenueEntries.workspaceId, revenueEntries.source, revenueEntries.externalId] });
      }

      results.push({ workspaceId: conn.workspaceId, provider, synced: rows.length });
    } catch (err) {
      // One workspace's bad/expired key shouldn't stop the rest of the
      // batch from syncing — record the failure and keep going.
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ workspaceId: conn.workspaceId, provider, synced: 0, error: message });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), connections: results.length, results });
}
