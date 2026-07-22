import "server-only";
import type { PaymentRevenueRow } from "@/lib/payment-providers";

const BASE_URL = "https://api.paystack.co";

/**
 * Paystack amounts are already in the subunit (kobo for NGN, cents for
 * USD/GHS) — same convention as Stripe's cents, no conversion needed. This
 * is the opposite of Flutterwave (see flutterwave.ts), which returns the
 * main currency unit — worth double-checking if either API changes this.
 */
export async function fetchRecentPaystackRevenue(apiKey: string, days = 90): Promise<PaymentRevenueRow[]> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows: PaymentRevenueRow[] = [];

  let page = 1;
  for (let i = 0; i < 20; i++) {
    const url = new URL(`${BASE_URL}/transaction`);
    url.searchParams.set("status", "success");
    url.searchParams.set("from", from);
    url.searchParams.set("perPage", "100");
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Paystack API error [${res.status}]: ${text.slice(0, 300)}`);
    }

    const json = await res.json();
    const data: unknown[] = json.data ?? [];

    for (const tx of data as Array<{ id: number; amount: number; currency: string; created_at: string; customer?: { email?: string } }>) {
      rows.push({
        externalId: String(tx.id),
        amountCents: tx.amount,
        currency: tx.currency.toLowerCase(),
        description: tx.customer?.email ? `Paystack — ${tx.customer.email}` : "Paystack payment",
        occurredOn: tx.created_at.slice(0, 10),
      });
    }

    const totalPages = json.meta?.pageCount ?? 1;
    if (page >= totalPages || data.length === 0) break;
    page++;
  }

  return rows;
}

export async function verifyPaystackKey(apiKey: string): Promise<{ accountName: string | null }> {
  // Cheapest authenticated call that confirms the key works without
  // side effects — a small transaction list. Paystack has no simple
  // "who am I" endpoint, so accountName is always null here.
  const res = await fetch(`${BASE_URL}/transaction?perPage=1`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error("Paystack rejected this key.");
  return { accountName: null };
}
