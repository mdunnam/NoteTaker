"use client";

import {
  getClarificationQuestionNoiseAssessment,
  type ClarificationQuestionStat,
} from "@/lib/clarification";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ClarificationFeedbackPanelProps {
  stats: ClarificationQuestionStat[];
}

/**
 * Settings panel for clarification question answer and dismissal feedback.
 */
export default function ClarificationFeedbackPanel({ stats }: ClarificationFeedbackPanelProps) {
  const router = useRouter();
  const [activeStats, setActiveStats] = useState(stats);
  const [isRestoringKey, setIsRestoringKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveStats(stats);
  }, [stats]);

  if (activeStats.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No clarification feedback yet. Once you answer or dismiss clarification prompts, their question styles will appear here.
      </div>
    );
  }

  const downranked = activeStats.filter((stat) => getClarificationQuestionNoiseAssessment(stat).level === "downranked").length;
  const suppressed = activeStats.filter((stat) => getClarificationQuestionNoiseAssessment(stat).level === "suppressed").length;

  /** Restore one noisy clarification style so future questions can surface it again if needed. */
  const restoreStyle = async (stat: ClarificationQuestionStat) => {
    setIsRestoringKey(stat.key);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/user/clarification-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: stat.key, action: "restore" }),
      });

      if (!response.ok) {
        throw new Error("Failed to restore clarification style");
      }

      const now = new Date().toISOString();
      setActiveStats((current) => current.map((item) => item.key === stat.key
        ? {
            ...item,
            restores: item.restores + 1,
            lastAction: "restored",
            lastActionAt: now,
          }
        : item));
      setMessage(`Restored ${stat.label} so it can surface again when needed.`);
      router.refresh();
    } catch (restoreError) {
      console.error("Error restoring clarification style:", restoreError);
      setError("Could not restore this clarification style.");
    } finally {
      setIsRestoringKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Tracked question styles</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.length}</p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-700">Down-ranked</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{downranked}</p>
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs uppercase tracking-wide text-red-700">Suppressed</p>
          <p className="mt-1 text-2xl font-bold text-red-900">{suppressed}</p>
        </div>
      </div>

      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2">Question Style</th>
              <th className="px-4 py-2">Heuristic</th>
              <th className="px-3 py-2 text-center">Answered</th>
              <th className="px-3 py-2 text-center">Dismissed</th>
              <th className="px-3 py-2 text-center">Restored</th>
              <th className="px-4 py-2 text-right">Last Action</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeStats.slice(0, 12).map((stat) => {
              const assessment = getClarificationQuestionNoiseAssessment(stat);
              const className = assessment.level === "suppressed"
                ? "bg-red-100 text-red-700"
                : assessment.level === "downranked"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700";
              const label = assessment.level === "suppressed"
                ? `suppressed (${assessment.noiseScore})`
                : assessment.level === "downranked"
                  ? `downranked (${assessment.noiseScore})`
                  : "normal";

              return (
                <tr key={stat.key} className="bg-white hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{stat.label}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
                      {label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-700">{stat.answers}</td>
                  <td className="px-3 py-2.5 text-center text-gray-700">{stat.dismisses}</td>
                  <td className="px-3 py-2.5 text-center text-gray-700">{stat.restores}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                    {stat.lastAction} · {new Date(stat.lastActionAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {assessment.level !== "normal" ? (
                      <button
                        type="button"
                        onClick={() => void restoreStyle(stat)}
                        disabled={isRestoringKey !== null}
                        className="rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                      >
                        {isRestoringKey === stat.key ? "Saving..." : "Restore"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}