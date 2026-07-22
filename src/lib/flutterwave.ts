import "server-only";
import type { PaymentRevenueRow } from "@/lib/payment-providers";

const BASE_URL = "https://api.flutterwave.com/v3";

/**
 * Flutterwave's `amount` field is the actual transaction amount in the
 * main currency unit (e.g. 5000 = ₦5,000), NOT a subunit like
 * Stripe/Paystack's cents/kobo. Multiplying by 100 here keeps
 * revenue_entries.amountCents consistent across every provider — every
 * other row in that table is "smallest unit", so Flutterwave is the one
 * that needs converting, not the schema.
 */
export async function fetchRecentFlutterwaveRevenue(apiKey: string, days = 90): Promise<PaymentRevenueRow[]> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const rows: PaymentRevenueRow[] = [];

  let page = 1;
  for (let i = 0; i < 20; i++) {
    const url = new URL(`${BASE_URL}/transactions`);
    url.searchParams.set("status", "successful");
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Flutterwave API error [${res.status}]: ${text.slice(0, 300)}`);
    }

    const json = await res.json();
    const data: unknown[] = json.data ?? [];

    for (const tx of data as Array<{ id: number; amount: number; currency: string; created_at: string; customer?: { email?: string } }>) {
      rows.push({
        externalId: String(tx.id),
        amountCents: Math.round(tx.amount * 100), // main unit -> smallest unit, see comment above
        currency: tx.currency.toLowerCase(),
        description: tx.customer?.email ? `Flutterwave — ${tx.customer.email}` : "Flutterwave payment",
        occurredOn: tx.created_at.slice(0, 10),
      });
    }

    const totalPages = json.meta?.page_info?.total_pages ?? 1;
    if (page >= totalPages || data.length === 0) break;
    page++;
  }

  return rows;
}

export async function verifyFlutterwaveKey(apiKey: string): Promise<{ accountName: string | null }> {
  const res = await fetch(`${BASE_URL}/transactions?page=1`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error("Flutterwave rejected this key.");
  return { accountName: null };
}
