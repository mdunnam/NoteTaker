import type { UserStats } from "@/lib/userStats";

interface AIPerformancePanelProps {
  stats: UserStats;
}

/** Format percentage from 0..1 as human-readable label. */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/** Format milliseconds to concise seconds label. */
function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Dashboard cards for AI instrumentation metrics in Settings.
 */
export default function AIPerformancePanel({ stats }: AIPerformancePanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">First-Pass Confidence</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatPercent(stats.avgConfidence)}</p>
        <p className="mt-1 text-xs text-gray-500">Average confidence across processed notes.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Clarification Rate</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatPercent(stats.clarificationRate)}</p>
        <p className="mt-1 text-xs text-gray-500">
          {stats.lowConfidenceCount} low-confidence note{stats.lowConfidenceCount === 1 ? "" : "s"} still needing clarity.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Clarification Conversion</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatPercent(stats.clarificationConversionRate)}</p>
        <p className="mt-1 text-xs text-gray-500">Hint uses relative to low-confidence backlog.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Avg Hint Confidence Lift</p>
        <p className={`mt-1 text-2xl font-bold ${stats.avgHintLift >= 0 ? "text-green-700" : "text-red-600"}`}>
          {stats.avgHintLift >= 0 ? "+" : ""}{formatPercent(stats.avgHintLift)}
        </p>
        <p className="mt-1 text-xs text-gray-500">Based on {stats.hintUses} chip interaction{stats.hintUses === 1 ? "" : "s"}.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Avg Time To Resolution</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatSeconds(stats.avgTimeToResolutionMs)}</p>
        <p className="mt-1 text-xs text-gray-500">From note creation to completed enrichment.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Queue Health</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{stats.stillProcessing}</p>
        <p className="mt-1 text-xs text-gray-500">
          {stats.failedJobs} failed job{stats.failedJobs === 1 ? "" : "s"} and {stats.processedNotes}/{stats.totalNotes} notes processed.
        </p>
      </div>
    </div>
  );
}
