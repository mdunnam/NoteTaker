import { auth } from "@/auth";
import { getAppBaseUrl, getStripeClient } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CheckoutBodySchema = z.object({
  plan: z.enum(["pro-monthly", "pro-annual"]),
});

const PLAN_TO_PRICE_ENV: Record<"pro-monthly" | "pro-annual", string> = {
  "pro-monthly": "STRIPE_PRICE_PRO_MONTHLY",
  "pro-annual": "STRIPE_PRICE_PRO_ANNUAL",
};

/**
 * POST /api/billing/checkout
 * Creates a Stripe Checkout session for subscription purchase.
 */
export async function POST(request: NextRequest) {
  try {
    const parsedBody = CheckoutBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const session = await auth();
    const stripe = getStripeClient();

    const priceEnvName = PLAN_TO_PRICE_ENV[parsedBody.data.plan];
    const priceId = process.env[priceEnvName];
    if (!priceId) {
      return NextResponse.json(
        { error: `Missing ${priceEnvName}` },
        { status: 500 }
      );
    }

    const baseUrl = getAppBaseUrl();

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?checkout=success`,
      cancel_url: `${baseUrl}/?checkout=cancel`,
      customer_email: session?.user?.email || undefined,
      metadata: {
        plan: parsedBody.data.plan,
        userId: session?.user?.id || "anonymous",
      },
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "Checkout session has no URL" }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
