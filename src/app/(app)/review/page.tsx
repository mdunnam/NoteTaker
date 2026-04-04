import { auth } from "@/auth";
import ClarificationLoop from "@/components/notes/ClarificationLoop";
import ReviewSuppressionActions from "@/components/review/ReviewSuppressionActions";
import ReclassificationQueue from "@/components/notes/ReclassificationQueue";
import { getUserReclassificationCandidates } from "@/lib/clusters";
import { getConfidenceBadgeConfig } from "@/lib/confidence";
import { prisma } from "@/lib/db";
import { getUserForgottenNoteCandidates, getUserReviewPatterns } from "@/lib/resurfacing";
import { getThinkingMemory, getThinkingMemoryHints, isReviewItemSuppressed } from "@/lib/userMemory";
import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * Dedicated review surface for low-confidence notes and changed-meaning regrouping suggestions.
 */
export default async function ReviewPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [lowConfidenceNotes, reclassificationCandidates, forgottenCandidates, reviewPatterns, thinkingMemory] = await Promise.all([
    prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        status: "PROCESSED",
        confidenceScore: { lt: 0.65 },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        summary: true,
        category: true,
        suggestedProject: true,
        confidenceScore: true,
        aiMeta: true,
        updatedAt: true,
      },
    }),
    getUserReclassificationCandidates(session.user.id, 12),
    getUserForgottenNoteCandidates(session.user.id, 8),
    getUserReviewPatterns(session.user.id, 6),
    getThinkingMemory(session.user.id),
  ]);

  const quickHints = getThinkingMemoryHints(thinkingMemory);
  const visibleForgottenCandidates = forgottenCandidates.filter(
    (candidate) => !isReviewItemSuppressed(thinkingMemory.reviewState, "forgotten-note", candidate.note.id)
  );
  const visibleReviewPatterns = reviewPatterns.filter(
    (pattern) => !isReviewItemSuppressed(thinkingMemory.reviewState, "pattern", pattern.id)
  );
  const totalReviewItems = lowConfidenceNotes.length + reclassificationCandidates.length + visibleForgottenCandidates.length + visibleReviewPatterns.length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Review</h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Review is where QNote brings uncertain notes and changed-meaning suggestions into one queue so you can correct the system without hunting through inbox, note detail, and side panels.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total review items</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{totalReviewItems}</p>
          <p className="mt-1 text-xs text-gray-600">Clarification, regrouping, forgotten-note, and repeated-pattern work.</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Needs clarification</p>
          <p className="mt-2 text-2xl font-bold text-amber-900">{lowConfidenceNotes.length}</p>
          <p className="mt-1 text-xs text-amber-800">Low-confidence notes that still need direct answers or hint guidance.</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Changed meaning</p>
          <p className="mt-2 text-2xl font-bold text-emerald-900">{reclassificationCandidates.length}</p>
          <p className="mt-1 text-xs text-emerald-800">Notes whose project or category context likely improved from newer note evidence.</p>
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Resurface</p>
          <p className="mt-2 text-2xl font-bold text-indigo-900">{visibleForgottenCandidates.length + visibleReviewPatterns.length}</p>
          <p className="mt-1 text-xs text-indigo-800">Forgotten notes and recurring patterns worth revisiting now.</p>
        </div>
      </div>

      {totalReviewItems === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Review queue clear</h2>
          <p className="mt-2 text-sm text-gray-600">
            Nothing needs clarification or regrouping right now. As resurfacing and repeated-pattern detection land, this page will expand to include those review tasks too.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {reclassificationCandidates.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Changed Meaning</h2>
                <p className="mt-1 text-sm text-gray-600">
                  These notes now have stronger project or category context because newer notes clarified what they belong to.
                </p>
              </div>

              <ReclassificationQueue
                candidates={reclassificationCandidates}
                showBatchActions
                title="Changed-Meaning Queue"
              />
            </section>
          )}

          {lowConfidenceNotes.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Needs Clarification</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Resolve low-confidence notes here with direct answers or quick hints instead of jumping between individual note pages.
                </p>
              </div>

              <div className="space-y-4">
                {lowConfidenceNotes.map((note) => {
                  const confidenceBadge = getConfidenceBadgeConfig(note.confidenceScore);

                  return (
                    <article key={note.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/notes/${note.id}`} className="text-base font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                            {note.title || "Untitled note"}
                          </Link>
                          {note.summary && (
                            <p className="mt-1 text-sm text-gray-600">{note.summary}</p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            {note.suggestedProject && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                                {note.suggestedProject}
                              </span>
                            )}
                            {note.category && (
                              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700">
                                {note.category}
                              </span>
                            )}
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                              Updated {new Date(note.updatedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                        </div>

                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${confidenceBadge.className}`}>
                          {confidenceBadge.label}
                        </span>
                      </div>

                      <div className="mt-4">
                        <ClarificationLoop
                          noteId={note.id}
                          aiMeta={note.aiMeta}
                          quickHints={quickHints}
                          alwaysShowHistory
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {visibleForgottenCandidates.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Forgotten Notes</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Older notes resurfaced because they still contain tasks or overlap with what you have been writing about recently.
                </p>
              </div>

              <div className="space-y-3">
                {visibleForgottenCandidates.map((candidate) => (
                  <article key={candidate.note.id} className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/notes/${candidate.note.id}`} className="text-base font-semibold text-gray-900 hover:text-indigo-700 hover:underline">
                          {candidate.note.title || "Untitled note"}
                        </Link>
                        <p className="mt-1 text-sm text-gray-600">{candidate.note.summary || "No summary yet."}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <span className="rounded-full bg-white px-2 py-0.5 text-indigo-700">
                            {candidate.ageDays} days old
                          </span>
                          {candidate.priority && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                              {candidate.priority} priority
                            </span>
                          )}
                          {candidate.extractedTaskCount > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                              {candidate.extractedTaskCount} task{candidate.extractedTaskCount === 1 ? "" : "s"}
                            </span>
                          )}
                          {candidate.overlapSignals.map((signal) => (
                            <span key={`${candidate.note.id}-${signal}`} className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                              {signal}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-indigo-900">{candidate.reason}</p>
                    <ReviewSuppressionActions kind="forgotten-note" targetId={candidate.note.id} />
                  </article>
                ))}
              </div>
            </section>
          )}

          {visibleReviewPatterns.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Repeated Patterns</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Recent notes are clustering around these same themes. This is the first layer of pattern review before full synthesis lands.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {visibleReviewPatterns.map((pattern) => (
                  <article key={pattern.id} className="rounded-xl border border-purple-200 bg-purple-50 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{pattern.label}</h3>
                        <p className="mt-1 text-sm text-purple-900">{pattern.reason}</p>
                      </div>

                      <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${pattern.kind === "project" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {pattern.kind}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full bg-white px-2 py-0.5 text-purple-700">
                        {pattern.noteCount} notes
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-gray-600">
                        Last seen {new Date(pattern.lastSeenAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    <ul className="mt-4 space-y-2">
                      {pattern.supportingNotes.map((note) => (
                        <li key={note.id} className="rounded-lg border border-purple-100 bg-white p-3">
                          <Link href={`/notes/${note.id}`} className="text-sm font-medium text-gray-900 hover:text-purple-700 hover:underline">
                            {note.title || "Untitled note"}
                          </Link>
                          <p className="mt-1 text-xs text-gray-600">{note.summary || "No summary yet."}</p>
                        </li>
                      ))}
                    </ul>

                    <ReviewSuppressionActions kind="pattern" targetId={pattern.id} />
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}