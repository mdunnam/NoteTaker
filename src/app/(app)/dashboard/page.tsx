import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getOrCreateDigest } from "@/lib/dailyDigest";
import DashboardClient from "@/components/dashboard/DashboardClient";
import type { DigestContent } from "@/lib/digestTypes";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const dateStr = new Date().toISOString().split("T")[0];

  let digest: DigestContent | null = null;
  let errorMsg: string | null = null;

  try {
    digest = await getOrCreateDigest(session.user.id, dateStr);
  } catch (err) {
    console.error("[Dashboard] failed to load digest:", err);
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  if (errorMsg || !digest) {
    return (
      <div className="p-8 max-w-xl mx-auto mt-16 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <h1 className="text-xl font-semibold text-gray-800">Digest failed to load</h1>
        <p className="mt-2 text-sm text-gray-500 font-mono bg-gray-100 rounded p-3 text-left break-all">
          {errorMsg ?? "Unknown error"}
        </p>
        <p className="mt-4 text-sm text-gray-400">Check Vercel function logs for the full stack trace.</p>
      </div>
    );
  }

  return <DashboardClient digest={digest} dateStr={dateStr} />;
}
