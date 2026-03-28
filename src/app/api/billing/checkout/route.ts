import { auth } from "@/auth";
import { getAppBaseUrl, getStripeClient } from "@/lib/stripe";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CheckoutBodySchema = z.object({
  plan: z.literal("pro-monthly"),
});

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

    const priceId = process.env.STRIPE_PRICE_PRO_MONTHLY;
    if (!priceId) {
      return NextResponse.json(
        { error: "Missing STRIPE_PRICE_PRO_MONTHLY" },
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
