import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import {
  getClarificationQuestionStats,
  getHintStats,
  getReviewActionStats,
  getThinkingMemory,
} from "@/lib/userMemory";
import { getUserStats } from "@/lib/userStats";
import SettingsClient from "@/components/settings/SettingsClient";
import HintEffectivenessPanel from "@/components/settings/HintEffectivenessPanel";
import AIPerformancePanel from "@/components/settings/AIPerformancePanel";
import ReviewStatePanel from "@/components/settings/ReviewStatePanel";
import ClarificationFeedbackPanel from "@/components/settings/ClarificationFeedbackPanel";
import CaptureFromAnywherePanel from "@/components/settings/CaptureFromAnywherePanel";
import IdentityAliasesPanel from "@/components/settings/IdentityAliasesPanel";

/**
 * User settings page.
 */
export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [user, hintStats, userStats, thinkingMemory, reviewActionStats, clarificationQuestionStats] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    }),
    getHintStats(session.user.id),
    getUserStats(session.user.id),
    getThinkingMemory(session.user.id),
    getReviewActionStats(session.user.id),
    getClarificationQuestionStats(session.user.id),
  ]);

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Settings</h1>
      <p className="mb-6 text-gray-600">Manage your profile and account preferences.</p>
      <SettingsClient name={user.name} email={user.email} />

      <div className="mt-10 max-w-xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">Your Identity</h2>
        <p className="mb-4 text-sm text-gray-600">
          Tell QNote which names refer to you. The AI will never flag these as other people in your daily digest or briefings.
        </p>
        <IdentityAliasesPanel />
      </div>

      <div className="mt-10 max-w-5xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">AI Performance</h2>
        <p className="mb-4 text-sm text-gray-600">
          Track clarification conversion, question-noise pressure, confidence movement, and enrichment speed to verify the AI workflow is improving over time.
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

      <div className="mt-10 max-w-5xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">Clarification Feedback</h2>
        <p className="mb-4 text-sm text-gray-600">
          Track which clarification question styles you answer, dismiss, restore, or implicitly train away so QNote can ask tighter follow-up questions over time.
        </p>
        <ClarificationFeedbackPanel stats={clarificationQuestionStats} />
      </div>

      <div className="mt-10 max-w-5xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">Review State</h2>
        <p className="mb-4 text-sm text-gray-600">
          Manage suppressed resurfacing items and inspect which review signals are repeatedly snoozed, dismissed, or restored.
        </p>
        <ReviewStatePanel reviewState={thinkingMemory.reviewState} actionStats={reviewActionStats} />
      </div>

      <div className="mt-10 max-w-4xl">
        <h2 className="mb-1 text-xl font-bold text-gray-900">Capture From Anywhere</h2>
        <p className="mb-4 text-sm text-gray-600">
          Set up the browser bookmarklet so short web clips and external thoughts can land in QNote without opening the full app first.
        </p>
        <CaptureFromAnywherePanel />
      </div>
    </div>
  );
}
