import "server-only";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import type { PlanTier } from "@/lib/plan-limits";

/**
 * Platform-level Stripe client — Forge 2's own account, billing a
 * workspace for its OWN subscription. Uses STRIPE_SECRET_KEY (a server
 * env var, set once for the whole app), NOT the BYOK
 * workspace_payment_settings key a workspace connects to bill its own
 * clients (src/lib/stripe.ts). Same provider, two unrelated Stripe
 * accounts — this file and stripe.ts should never import from each other.
 */
function platformStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY environment variable (Forge 2's own platform Stripe account).");
  return new Stripe(key);
}

function priceIdFor(tier: Exclude<PlanTier, "free">): string {
  const envVar = tier === "lite" ? "STRIPE_PRICE_ID_LITE" : "STRIPE_PRICE_ID_PRO";
  const id = process.env[envVar];
  if (!id) throw new Error(`Missing ${envVar} environment variable.`);
  return id;
}

/** Finds or creates the platform Stripe customer for a workspace, persisting the id so it's reused on future checkouts. */
async function resolveCustomerId(workspaceId: string, workspaceName: string, ownerEmail: string): Promise<string> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (workspace?.stripeCustomerId) return workspace.stripeCustomerId;

  const stripe = platformStripe();
  const customer = await stripe.customers.create({
    name: workspaceName,
    email: ownerEmail,
    metadata: { forge2WorkspaceId: workspaceId },
  });

  await db.update(workspaces).set({ stripeCustomerId: customer.id }).where(eq(workspaces.id, workspaceId));
  return customer.id;
}

/**
 * Creates a Checkout session for a workspace to subscribe to Lite or Pro.
 * The webhook (api/billing/webhook) is what actually flips
 * workspace.plan once payment succeeds — this just starts the flow.
 */
export async function createCheckoutSession(params: {
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string;
  tier: Exclude<PlanTier, "free">;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = platformStripe();
  const customerId = await resolveCustomerId(params.workspaceId, params.workspaceName, params.ownerEmail);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceIdFor(params.tier), quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { forge2WorkspaceId: params.workspaceId, forge2Tier: params.tier },
    subscription_data: { metadata: { forge2WorkspaceId: params.workspaceId, forge2Tier: params.tier } },
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return session.url;
}

/** Stripe's self-serve "manage/cancel my subscription" page — requires the workspace to already have a customer id (i.e. have checked out at least once). */
export async function createBillingPortalSession(workspaceId: string, returnUrl: string): Promise<string> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace?.stripeCustomerId) {
    throw new Error("This workspace has no billing history yet — subscribe to a paid plan first.");
  }

  const stripe = platformStripe();
  const session = await stripe.billingPortal.sessions.create({ customer: workspace.stripeCustomerId, return_url: returnUrl });
  return session.url;
}

/** Verifies and parses a platform billing webhook — separate secret from the BYOK Stripe webhook a workspace might configure for its own Stripe account (there isn't one currently, but keeping the naming distinct matters). */
export async function constructPlatformWebhookEvent(rawBody: string, signature: string): Promise<Stripe.Event> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable.");
  const stripe = platformStripe();
  return stripe.webhooks.constructEventAsync(rawBody, signature, secret);
}

/** Maps a Stripe price id back to a Forge 2 tier — used by the webhook when a subscription's price changes (upgrade/downgrade via the billing portal, not just Checkout). */
export function tierForPriceId(priceId: string): PlanTier | null {
  if (priceId === process.env.STRIPE_PRICE_ID_LITE) return "lite";
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return "pro";
  return null;
}
