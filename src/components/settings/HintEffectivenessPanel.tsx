"use client";

import type { HintStat } from "@/lib/userMemory";

interface HintEffectivenessPanelProps {
  stats: HintStat[];
}

/** Format average confidence lift as a signed percentage string. */
function formatLift(stat: HintStat): string {
  if (stat.uses === 0) return "–";
  const avg = stat.totalConfidenceLift / stat.uses;
  const pct = (avg * 100).toFixed(0);
  return avg >= 0 ? `+${pct}%` : `${pct}%`;
}

/** Colour class based on average lift: positive = green, neutral = gray, negative = red. */
function liftColour(stat: HintStat): string {
  if (stat.uses === 0) return "text-gray-500";
  const avg = stat.totalConfidenceLift / stat.uses;
  if (avg > 0.05) return "text-green-700";
  if (avg < -0.02) return "text-red-600";
  return "text-gray-600";
}

/**
 * Panel shown in Settings displaying hint chip usage and AI confidence lift.
 * Helps the user see whether the system is learning and which hints are most useful.
 */
export default function HintEffectivenessPanel({ stats }: HintEffectivenessPanelProps) {
  if (stats.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No hint data yet. Use the clarification chips in inbox or note detail to start building your effectiveness profile.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2">Hint</th>
            <th className="px-4 py-2">Kind</th>
            <th className="px-3 py-2 text-center">Uses</th>
            <th className="px-3 py-2 text-center">Avg Confidence Lift</th>
            <th className="px-4 py-2 text-right">Last Used</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {stats.map((stat) => (
            <tr key={`${stat.kind}-${stat.hint}`} className="bg-white hover:bg-gray-50">
              <td className="px-4 py-2.5 font-medium text-gray-900">{stat.hint}</td>
              <td className="px-4 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  stat.kind === "project" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                }`}>
                  {stat.kind}
                </span>
              </td>
              <td className="px-3 py-2.5 text-center text-gray-700">{stat.uses}</td>
              <td className={`px-3 py-2.5 text-center font-semibold ${liftColour(stat)}`}>
                {formatLift(stat)}
              </td>
              <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                {new Date(stat.lastUsed).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
