import type { ForgottenNoteCandidate, ReviewPatternCandidate } from "@/lib/resurfacing";
import ReviewSuppressionActions from "@/components/review/ReviewSuppressionActions";
import Link from "next/link";

interface ResurfacingRailProps {
  forgottenCandidates: ForgottenNoteCandidate[];
  reviewPatterns: ReviewPatternCandidate[];
  compact?: boolean;
  title?: string;
  showReviewLink?: boolean;
}

/** Compact resurfacing surface reused in Inbox and the shared right panel. */
export default function ResurfacingRail({
  forgottenCandidates,
  reviewPatterns,
  compact = false,
  title = "Resurface",
  showReviewLink = true,
}: ResurfacingRailProps) {
  if (forgottenCandidates.length === 0 && reviewPatterns.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className={`font-semibold text-gray-900 ${compact ? "text-sm" : "text-base"}`}>{title}</h3>
          <p className={`text-gray-600 ${compact ? "text-[11px]" : "text-xs"}`}>
            Older notes and recurring themes worth pulling back into the active loop.
          </p>
        </div>
        {showReviewLink && (
          <Link href="/review" className="text-xs font-medium text-blue-700 hover:underline">
            Open Review
          </Link>
        )}
      </div>

      {forgottenCandidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">From the past</p>
          {forgottenCandidates.slice(0, compact ? 2 : 4).map((candidate) => (
            <article key={candidate.note.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <Link href={`/notes/${candidate.note.id}`} className={`font-medium text-gray-900 hover:text-indigo-700 hover:underline ${compact ? "text-xs" : "text-sm"}`}>
                {candidate.note.title || "Untitled note"}
              </Link>
              <p className={`mt-1 text-gray-700 ${compact ? "text-[11px]" : "text-xs"}`}>{candidate.reason}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-white px-2 py-0.5 text-indigo-700">{candidate.ageDays}d old</span>
                {candidate.overlapSignals.map((signal) => (
                  <span key={`${candidate.note.id}-${signal}`} className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{signal}</span>
                ))}
              </div>
              <ReviewSuppressionActions kind="forgotten-note" targetId={candidate.note.id} label={candidate.note.title || undefined} />
            </article>
          ))}
        </div>
      )}

      {reviewPatterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">Recurring themes</p>
          {reviewPatterns.slice(0, compact ? 2 : 4).map((pattern) => (
            <article key={pattern.id} className="rounded-lg border border-purple-200 bg-purple-50 p-3">
              <p className={`font-medium text-gray-900 ${compact ? "text-xs" : "text-sm"}`}>{pattern.label}</p>
              <p className={`mt-1 text-gray-700 ${compact ? "text-[11px]" : "text-xs"}`}>{pattern.reason}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-white px-2 py-0.5 text-purple-700">{pattern.noteCount} notes</span>
                <span className={`rounded-full bg-white px-2 py-0.5 ${pattern.kind === "project" ? "text-blue-700" : pattern.kind === "topic" ? "text-purple-700" : "text-emerald-700"}`}>
                  {pattern.kind}
                </span>
              </div>
              <ReviewSuppressionActions kind="pattern" targetId={pattern.id} label={pattern.label} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}