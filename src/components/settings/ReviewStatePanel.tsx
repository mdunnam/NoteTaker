import ReviewSuppressionActions from "@/components/review/ReviewSuppressionActions";
import type { ReviewActionStat, ReviewState } from "@/lib/userMemory";
import Link from "next/link";

interface ReviewStatePanelProps {
  reviewState: ReviewState;
  actionStats: ReviewActionStat[];
}

interface ActiveSuppressionItem {
  id: string;
  label: string;
  kind: "forgotten-note" | "pattern";
  until: string;
  href?: string;
}

function buildActiveSuppressions(reviewState: ReviewState): ActiveSuppressionItem[] {
  return [
    ...reviewState.forgottenNotes.map((item) => ({
      id: item.id,
      label: item.label || `Suppressed note ${item.id}`,
      kind: "forgotten-note" as const,
      until: item.until,
      href: `/notes/${item.id}`,
    })),
    ...reviewState.patterns.map((item) => ({
      id: item.id,
      label: item.label || `Suppressed pattern ${item.id}`,
      kind: "pattern" as const,
      until: item.until,
    })),
  ].sort((left, right) => new Date(left.until).getTime() - new Date(right.until).getTime());
}

/**
 * Settings panel for active review suppressions and snooze/dismiss telemetry.
 */
export default function ReviewStatePanel({ reviewState, actionStats }: ReviewStatePanelProps) {
  const activeSuppressions = buildActiveSuppressions(reviewState);

  if (activeSuppressions.length === 0 && actionStats.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        No review-state history yet. Once you snooze or dismiss resurfacing items, they will appear here for restore and analysis.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Active suppressions</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{activeSuppressions.length}</p>
        </div>

        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-xs uppercase tracking-wide text-indigo-700">Forgotten notes hidden</p>
          <p className="mt-1 text-2xl font-bold text-indigo-900">{reviewState.forgottenNotes.length}</p>
        </div>

        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <p className="text-xs uppercase tracking-wide text-purple-700">Patterns hidden</p>
          <p className="mt-1 text-2xl font-bold text-purple-900">{reviewState.patterns.length}</p>
        </div>
      </div>

      {activeSuppressions.length > 0 && (
        <div>
          <h3 className="mb-1 text-lg font-semibold text-gray-900">Active Suppressions</h3>
          <p className="mb-4 text-sm text-gray-600">
            Restore anything you want back in Review immediately instead of waiting for the snooze or dismiss window to expire.
          </p>

          <div className="space-y-3">
            {activeSuppressions.map((item) => (
              <article key={`${item.kind}-${item.id}`} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {item.href ? (
                      <Link href={item.href} className="text-sm font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                        {item.label}
                      </Link>
                    ) : (
                      <h4 className="text-sm font-semibold text-gray-900">{item.label}</h4>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className={`rounded-full px-2 py-0.5 ${item.kind === "forgotten-note" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"}`}>
                        {item.kind === "forgotten-note" ? "forgotten note" : "pattern"}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                        Hidden until {new Date(item.until).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <ReviewSuppressionActions kind={item.kind} targetId={item.id} label={item.label} actions={["restore"]} />
              </article>
            ))}
          </div>
        </div>
      )}

      {actionStats.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2">Signal</th>
                <th className="px-4 py-2">Kind</th>
                <th className="px-3 py-2 text-center">Snoozes</th>
                <th className="px-3 py-2 text-center">Dismisses</th>
                <th className="px-3 py-2 text-center">Restores</th>
                <th className="px-4 py-2 text-right">Last Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actionStats.slice(0, 12).map((stat) => (
                <tr key={`${stat.kind}-${stat.id}`} className="bg-white hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{stat.label || stat.id}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      stat.kind === "forgotten-note" ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"
                    }`}>
                      {stat.kind === "forgotten-note" ? "forgotten note" : "pattern"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-700">{stat.snoozes}</td>
                  <td className="px-3 py-2.5 text-center text-gray-700">{stat.dismisses}</td>
                  <td className="px-3 py-2.5 text-center text-gray-700">{stat.restores}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                    {stat.lastAction} · {new Date(stat.lastActionAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}