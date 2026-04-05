import type { MetricSeriesPoint, UserStats } from "@/lib/userStats";

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

/** Render a tiny SVG sparkline for 30-day metric history. */
function Sparkline({ points }: { points: MetricSeriesPoint[] }) {
  if (points.length < 2) {
    return <div className="mt-2 h-10 rounded bg-gray-50" />;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 32 - ((point.value - min) / range) * 28;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 32" className="mt-2 h-10 w-full overflow-visible">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500" />
    </svg>
  );
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
        <Sparkline points={stats.history.confidence} />
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
        <Sparkline points={stats.history.clarificationRate} />
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
        <p className="text-xs uppercase tracking-wide text-gray-500">Clarification Noise</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatPercent(stats.clarificationDismissRate)}</p>
        <TrendDelta
          delta={stats.trends.clarificationDismissRate.delta}
          betterWhen={stats.trends.clarificationDismissRate.betterWhen}
          asPercent
        />
        <Sparkline points={stats.history.clarificationDismissRate} />
        <p className="mt-1 text-xs text-gray-500">
          {stats.clarificationSuppressedStyles} suppressed and {stats.clarificationDownrankedStyles} down-ranked question style{stats.clarificationDownrankedStyles + stats.clarificationSuppressedStyles === 1 ? "" : "s"} across {stats.clarificationFeedbackCount} clarification feedback event{stats.clarificationFeedbackCount === 1 ? "" : "s"}.
        </p>
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
        <Sparkline points={stats.history.resolutionTimeMs} />
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
