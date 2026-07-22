import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { constructPlatformWebhookEvent, tierForPriceId } from "@/lib/platform-billing";

/**
 * POST /api/billing/webhook — Forge 2's OWN Stripe webhook (platform
 * billing), configured against STRIPE_WEBHOOK_SECRET. NOT the same
 * webhook concept as a workspace's BYOK Stripe connection in Revenue —
 * that integration polls via /api/cron/sync-revenue rather than using
 * webhooks at all. This is the only webhook-driven integration in the
 * whole app; everything else (Mux aside) is poll/sync-based.
 *
 * Three events matter:
 *   checkout.session.completed   — first subscribe, sets the plan
 *   customer.subscription.updated — covers upgrade/downgrade via the
 *                                    billing portal, or renewal/past-due
 *                                    status changes, not just Checkout
 *   customer.subscription.deleted — cancellation, reverts to free
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await constructPlatformWebhookEvent(rawBody, signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.forge2WorkspaceId;
      const tier = session.metadata?.forge2Tier;
      if (workspaceId && (tier === "lite" || tier === "pro")) {
        await db.update(workspaces).set({ plan: tier }).where(eq(workspaces.id, workspaceId));
      }
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata?.forge2WorkspaceId;
      if (!workspaceId) break;

      if (subscription.status === "active" || subscription.status === "trialing") {
        const priceId = subscription.items.data[0]?.price.id;
        const tier = priceId ? tierForPriceId(priceId) : null;
        if (tier) await db.update(workspaces).set({ plan: tier }).where(eq(workspaces.id, workspaceId));
      } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
        await db.update(workspaces).set({ plan: "free" }).where(eq(workspaces.id, workspaceId));
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata?.forge2WorkspaceId;
      if (workspaceId) await db.update(workspaces).set({ plan: "free" }).where(eq(workspaces.id, workspaceId));
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
