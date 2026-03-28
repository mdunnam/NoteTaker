import { auth } from "@/auth";
import LandingPageClient from "@/components/landing/LandingPageClient";

/**
 * Public marketing landing page with pricing and Stripe checkout CTA.
 */
export default async function HomePage() {
  const session = await auth();

  return (
    <LandingPageClient
      isSignedIn={Boolean(session?.user?.id)}
      userEmail={session?.user?.email || null}
    />
  );
}
