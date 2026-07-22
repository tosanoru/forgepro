import "server-only";
import Stripe from "stripe";
import type { PaymentRevenueRow } from "@/lib/payment-providers";

/**
 * Pulls the last `days` of successful charges as revenue rows, ready to
 * upsert into revenue_entries. Uses balance transactions rather than raw
 * charges so refunds/disputes net out correctly — a straight charge list
 * would overcount money that was later returned.
 */
export async function fetchRecentStripeRevenue(apiKey: string, days = 90): Promise<PaymentRevenueRow[]> {
  const stripe = new Stripe(apiKey);
  const since = Math.floor(Date.now() / 1000) - days * 86_400;

  const rows: PaymentRevenueRow[] = [];
  let startingAfter: string | undefined;

  // Paginate — an active agency can easily have more than one page of
  // transactions in a 90-day window.
  for (let page = 0; page < 20; page++) {
    const batch = await stripe.balanceTransactions.list({
      created: { gte: since },
      type: "charge",
      limit: 100,
      starting_after: startingAfter,
    });

    for (const tx of batch.data) {
      rows.push({
        externalId: tx.id,
        amountCents: tx.net, // net of Stripe's own fees — what actually landed
        currency: tx.currency,
        description: tx.description || "Stripe payment",
        occurredOn: new Date(tx.created * 1000).toISOString().slice(0, 10),
      });
    }

    if (!batch.has_more || batch.data.length === 0) break;
    startingAfter = batch.data[batch.data.length - 1].id;
  }

  return rows;
}

/** Cheap validation call used when someone first saves a key — confirms it's live and readable. */
export async function verifyStripeKey(apiKey: string): Promise<{ accountName: string | null }> {
  const stripe = new Stripe(apiKey);
  const account = await stripe.accounts.retrieveCurrent();
  return { accountName: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null };
}
