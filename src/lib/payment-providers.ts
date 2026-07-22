import "server-only";
import { fetchRecentStripeRevenue, verifyStripeKey } from "@/lib/stripe";
import { fetchRecentPaystackRevenue, verifyPaystackKey } from "@/lib/paystack";
import { fetchRecentFlutterwaveRevenue, verifyFlutterwaveKey } from "@/lib/flutterwave";

export type PaymentProvider = "stripe" | "paystack" | "flutterwave";

export const PAYMENT_PROVIDERS: PaymentProvider[] = ["stripe", "paystack", "flutterwave"];

export interface PaymentRevenueRow {
  externalId: string;
  amountCents: number; // always the smallest currency unit — see flutterwave.ts for why that one needs converting
  currency: string;
  description: string;
  occurredOn: string; // YYYY-MM-DD
}

/**
 * One dispatch table instead of a switch statement scattered across every
 * route that needs to sync or verify a provider. Adding a fourth provider
 * later means implementing fetchRecent()/verify() in its own file and
 * adding one entry here — no route file changes.
 */
export const PAYMENT_PROVIDER_ADAPTERS: Record<
  PaymentProvider,
  {
    fetchRecent: (apiKey: string, days?: number) => Promise<PaymentRevenueRow[]>;
    verify: (apiKey: string) => Promise<{ accountName: string | null }>;
  }
> = {
  stripe: { fetchRecent: fetchRecentStripeRevenue, verify: verifyStripeKey },
  paystack: { fetchRecent: fetchRecentPaystackRevenue, verify: verifyPaystackKey },
  flutterwave: { fetchRecent: fetchRecentFlutterwaveRevenue, verify: verifyFlutterwaveKey },
};

export function isPaymentProvider(value: string): value is PaymentProvider {
  return (PAYMENT_PROVIDERS as string[]).includes(value);
}
