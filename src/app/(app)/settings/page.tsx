import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getHintStats } from "@/lib/userMemory";
import { getUserStats } from "@/lib/userStats";
import SettingsClient from "@/components/settings/SettingsClient";
import HintEffectivenessPanel from "@/components/settings/HintEffectivenessPanel";
import AIPerformancePanel from "@/components/settings/AIPerformancePanel";

/**
 * User settings page.
 */
export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [user, hintStats, userStats] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    }),
    getHintStats(session.user.id),
    getUserStats(session.user.id),
  ]);

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Settings</h1>
      <p className="mb-6 text-gray-600">Manage your profile and account preferences.</p>
      <SettingsClient name={user.name} email={user.email} />

      <div className="mt-10 max-w-5xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">AI Performance</h2>
        <p className="mb-4 text-sm text-gray-600">
          Track clarification conversion, confidence movement, and enrichment speed to verify the AI workflow is improving over time.
        </p>
        <AIPerformancePanel stats={userStats} />
      </div>

      <div className="mt-10 max-w-3xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">Hint Effectiveness</h2>
        <p className="mb-4 text-sm text-gray-600">
          Every time you click a clarification chip, the system records how much the AI confidence improved.
          Use this to see which projects and contexts are most useful for teaching QNote.
        </p>
        <HintEffectivenessPanel stats={hintStats} />
      </div>
    </div>
  );
}
