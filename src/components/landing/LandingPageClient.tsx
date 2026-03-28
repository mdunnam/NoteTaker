"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Sparkles, Brain, Search, Layers } from "lucide-react";

interface LandingPageClientProps {
  isSignedIn: boolean;
  userEmail?: string | null;
}

/**
 * Public landing page with pricing and Stripe checkout CTA.
 */
export default function LandingPageClient({ isSignedIn, userEmail }: LandingPageClientProps) {
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [error, setError] = useState("");

  const features = useMemo(
    () => [
      "Capture notes instantly and let AI organize in the background",
      "Semantic search that finds ideas by meaning, not just keywords",
      "Context-aware ask mode with clarifying follow-up questions",
      "Durable queue processing with retries so enrichment never gets lost",
    ],
    []
  );

  /**
   * Start a Stripe checkout session for the Pro plan.
   */
  const handleCheckout = async () => {
    setIsLoadingCheckout(true);
    setError("");

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro-monthly" }),
      });

      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Failed to start checkout");
      }

      window.location.href = data.url;
    } catch (checkoutError) {
      const message = checkoutError instanceof Error ? checkoutError.message : "Checkout failed";
      setError(message);
    } finally {
      setIsLoadingCheckout(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_20%,#e5e7eb_0%,transparent_40%),radial-gradient(circle_at_85%_10%,#dbeafe_0%,transparent_35%),linear-gradient(160deg,#f9fafb_0%,#ffffff_45%,#f3f4f6_100%)] text-gray-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight [font-family:'Space_Grotesk',sans-serif]">QNote</p>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">AI Thinking Workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {isSignedIn ? (
              <>
                <span className="hidden text-gray-600 sm:inline">Signed in as {userEmail || "user"}</span>
                <Link href="/inbox" className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50">
                  Open App
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50">Login</Link>
                <Link href="/signup" className="rounded-lg bg-black px-3 py-2 font-medium text-white hover:bg-gray-800">
                  Create Account
                </Link>
              </>
            )}
          </div>
        </header>

        <section className="mb-16 grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 inline-flex items-center rounded-full bg-black px-3 py-1 text-xs uppercase tracking-[0.2em] text-white">
              Built for creators and operators
            </p>
            <h1 className="mb-4 text-5xl font-semibold leading-tight [font-family:'Fraunces',serif]">
              Think faster.
              <br />
              Let AI handle the mess.
            </h1>
            <p className="mb-8 max-w-xl text-lg text-gray-600">
              QNote captures raw thoughts, infers context, asks follow-up questions when needed, and learns your
              thought process over time.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <Brain className="mb-2 h-5 w-5 text-blue-600" />
                <p className="text-sm font-medium">Context Inference</p>
                <p className="mt-1 text-xs text-gray-600">AI asks clarifying questions when your intent is ambiguous.</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <Search className="mb-2 h-5 w-5 text-blue-600" />
                <p className="text-sm font-medium">Semantic Search</p>
                <p className="mt-1 text-xs text-gray-600">Find ideas by meaning across all your notes.</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <Layers className="mb-2 h-5 w-5 text-blue-600" />
                <p className="text-sm font-medium">Durable Queue</p>
                <p className="mt-1 text-xs text-gray-600">Reliable processing with retries and cron draining.</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <Sparkles className="mb-2 h-5 w-5 text-blue-600" />
                <p className="text-sm font-medium">Memory-Aware Ask</p>
                <p className="mt-1 text-xs text-gray-600">Gets smarter as it learns your recurring context patterns.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-200/60">
            <p className="mb-2 text-sm uppercase tracking-[0.16em] text-gray-500">Pro Plan</p>
            <div className="mb-6 flex items-end gap-2">
              <span className="text-5xl font-bold tracking-tight">$12</span>
              <span className="pb-2 text-gray-500">/ month</span>
            </div>

            <ul className="mb-8 space-y-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={handleCheckout}
              disabled={isLoadingCheckout}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingCheckout ? "Opening checkout..." : "Start Pro with Stripe"}
            </button>

            {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

            {!isSignedIn && (
              <p className="mt-4 text-xs text-gray-500">
                Tip: Create an account first so checkout links to your workspace automatically.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
