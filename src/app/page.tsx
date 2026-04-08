import { auth } from "@/auth";
import LandingPageClient from "@/components/landing/LandingPageClient";
import { redirect } from "next/navigation";

/**
 * Public marketing landing page with pricing and Stripe checkout CTA.
 * Redirects authenticated users to their knowledge base.
 */
export default async function HomePage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/home");
  }

  return (
    <LandingPageClient
      isSignedIn={false}
      userEmail={null}
    />
  );
}
