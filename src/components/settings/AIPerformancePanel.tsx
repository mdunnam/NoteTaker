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

/** Render a compact delta chip from a trend object. */
function TrendDelta({
  delta,
  betterWhen,
  asPercent,
}: {
  delta: number;
  betterWhen: "higher" | "lower";
  asPercent?: boolean;
}) {
  const abs = Math.abs(delta);
  const isUp = delta > 0;
  const isFlat = abs < 0.0001;
  const isGood = isFlat || (betterWhen === "higher" ? isUp : !isUp);
  const arrow = isFlat ? "→" : isUp ? "↑" : "↓";
  const value = asPercent ? `${(abs * 100).toFixed(0)}pp` : `${(abs / 1000).toFixed(1)}s`;

  return (
    <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
      isGood ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
    }`}>
      {arrow} {value} vs 30d
    </span>
  );
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
        <TrendDelta
          delta={stats.trends.confidence.delta}
          betterWhen={stats.trends.confidence.betterWhen}
          asPercent
        />
        <p className="mt-1 text-xs text-gray-500">Average confidence across processed notes.</p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Clarification Rate</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatPercent(stats.clarificationRate)}</p>
        <TrendDelta
          delta={stats.trends.clarificationRate.delta}
          betterWhen={stats.trends.clarificationRate.betterWhen}
          asPercent
        />
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
        <TrendDelta
          delta={stats.trends.resolutionTimeMs.delta}
          betterWhen={stats.trends.resolutionTimeMs.betterWhen}
        />
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
