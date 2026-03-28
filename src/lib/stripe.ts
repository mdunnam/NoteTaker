import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/**
 * Get a singleton Stripe client for server-side requests.
 */
export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  stripeClient = new Stripe(secretKey, {
    // Use account default API version to avoid SDK literal mismatch.
  });

  return stripeClient;
}

/**
 * Resolve the absolute app URL for redirects.
 */
export function getAppBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  );
}
