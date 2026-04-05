import { auth } from "@/auth";
import { getUserReclassificationCandidates } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import ReclassificationQueue from "@/components/notes/ReclassificationQueue";
import RightPanelContextual from "@/components/layout/RightPanelContextual";
import ResurfacingRail from "@/components/notes/ResurfacingRail";
import { getUserForgottenNoteCandidates, getUserReviewPatterns } from "@/lib/resurfacing";
import { getThinkingMemory, isReviewItemSuppressed } from "@/lib/userMemory";
import { getNoteHealthAssessment, summarizeWorkspaceHealth } from "@/lib/noteHealth";

/**
 * Right panel showing live note health and recent extracted tasks.
 */
export default async function RightPanel() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [
    totalNotes,
    uncategorizedCount,
    processingCount,
    recentNotes,
    healthNotes,
    topRelations,
    lowConfidenceNotes,
    highPriorityNotes,
    reclassificationCandidates,
    forgottenCandidates,
    reviewPatterns,
    thinkingMemory,
  ] = await Promise.all([
    prisma.note.count({
      where: {
        userId: session.user.id,
        isArchived: false,
      },
    }),
    prisma.note.count({
      where: {
        userId: session.user.id,
        isArchived: false,
        OR: [{ category: null }, { category: "" }],
      },
    }),
    prisma.note.count({
      where: {
        userId: session.user.id,
        status: "PROCESSING",
      },
    }),
    prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        title: true,
        extractedTasks: true,
      },
    }),
    prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 150,
      select: {
        id: true,
        title: true,
        summary: true,
        rawContent: true,
        category: true,
        type: true,
        status: true,
        confidenceScore: true,
        priority: true,
        suggestedProject: true,
        aiMeta: true,
        extractedTasks: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.noteRelation.findMany({
      where: {
        sourceNote: {
          userId: session.user.id,
        },
      },
      orderBy: {
        score: "desc",
      },
      take: 6,
      include: {
        sourceNote: {
          select: {
            title: true,
          },
        },
        targetNote: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        status: "PROCESSED",
        confidenceScore: { lt: 0.65 },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        aiMeta: true,
      },
    }),
    prisma.note.findMany({
      where: {
        userId: session.user.id,
        isArchived: false,
        status: "PROCESSED",
        priority: "high",
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        aiMeta: true,
      },
    }),
    getUserReclassificationCandidates(session.user.id, 3),
    getUserForgottenNoteCandidates(session.user.id, 3),
    getUserReviewPatterns(session.user.id, 3),
    getThinkingMemory(session.user.id),
  ]);

  const workspaceHealth = summarizeWorkspaceHealth(healthNotes);
  const atRiskNotes = healthNotes
    .map((note) => ({ note, assessment: getNoteHealthAssessment(note) }))
    .filter((entry) => entry.assessment.state === "at-risk")
    .sort((left, right) => left.assessment.score - right.assessment.score)
    .slice(0, 3);
  const visibleForgottenCandidates = forgottenCandidates.filter(
    (candidate) => !isReviewItemSuppressed(thinkingMemory.reviewState, "forgotten-note", candidate.note.id)
  );
  const visibleReviewPatterns = reviewPatterns.filter(
    (pattern) => !isReviewItemSuppressed(thinkingMemory.reviewState, "pattern", pattern.id)
  );

  const extractedTasks: Array<{
    noteId: string;
    noteTitle: string;
    text: string;
    dueDate?: string;
  }> = [];

  for (const note of recentNotes) {
    if (!Array.isArray(note.extractedTasks)) {
      continue;
    }

    for (const task of note.extractedTasks) {
      const maybeTask = task as { text?: string; dueDate?: string };

      if (!maybeTask?.text) {
        continue;
      }

      extractedTasks.push({
        noteId: note.id,
        noteTitle: note.title || "Untitled note",
        text: maybeTask.text,
        dueDate: maybeTask.dueDate,
      });

      if (extractedTasks.length >= 6) {
        break;
      }
    }

    if (extractedTasks.length >= 6) {
      break;
    }
  }

  return (
    <aside className="w-80 border-l border-gray-200 bg-gray-50 p-6 overflow-y-auto">
      <div className="space-y-6">
        <RightPanelContextual />

        {reclassificationCandidates.length > 0 && (
          <ReclassificationQueue
            candidates={reclassificationCandidates}
            compact
            title="Changed Meaning"
          />
        )}

        <div>
          <h3 className="font-semibold text-sm mb-3">Note Health</h3>
          <ul className="space-y-2 text-xs text-gray-700">
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>Average score</span>
              <strong>{workspaceHealth.averageScore}</strong>
            </li>
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>At risk</span>
              <strong>{workspaceHealth.atRiskCount}</strong>
            </li>
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>Watch</span>
              <strong>{workspaceHealth.watchCount}</strong>
            </li>
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>Total active notes</span>
              <strong>{totalNotes}</strong>
            </li>
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>Uncategorized</span>
              <strong>{uncategorizedCount}</strong>
            </li>
            <li className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2">
              <span>Still processing</span>
              <strong>{processingCount}</strong>
            </li>
          </ul>

          {atRiskNotes.length > 0 && (
            <ul className="mt-3 space-y-2">
              {atRiskNotes.map(({ note, assessment }) => (
                <li key={note.id} className="rounded border border-red-200 bg-red-50 p-3">
                  <a href={`/notes/${note.id}`} className="text-xs font-medium text-red-900 hover:underline">
                    {note.title || "Untitled note"}
                  </a>
                  <p className="mt-1 text-[11px] text-red-800">{assessment.reasons[0] || "Needs attention soon."}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(visibleForgottenCandidates.length > 0 || visibleReviewPatterns.length > 0) && (
          <div className="pt-6 border-t border-gray-200">
            <ResurfacingRail
              forgottenCandidates={visibleForgottenCandidates}
              reviewPatterns={visibleReviewPatterns}
              compact
              title="Resurfacing"
            />
          </div>
        )}

        <div className="pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-sm mb-3">Recent Extracted Tasks</h3>
          {extractedTasks.length === 0 ? (
            <p className="text-xs text-gray-600">No extracted tasks yet.</p>
          ) : (
            <ul className="space-y-2">
              {extractedTasks.map((task, index) => (
                <li key={`${task.noteId}-${index}`} className="rounded border border-gray-200 bg-white p-3">
                  <div className="text-xs font-medium text-gray-900">{task.text}</div>
                  <div className="mt-1 text-[11px] text-gray-600">{task.noteTitle}</div>
                  {task.dueDate && (
                    <div className="mt-1 text-[11px] text-blue-700">Due: {task.dueDate}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-sm mb-3">Top Related Notes</h3>
          {topRelations.length === 0 ? (
            <p className="text-xs text-gray-600">No related-note links yet.</p>
          ) : (
            <ul className="space-y-2">
              {topRelations.map((relation) => (
                <li
                  key={relation.id}
                  className="rounded border border-gray-200 bg-white p-3 text-[11px] text-gray-700"
                >
                  <div className="font-medium text-gray-900">
                    {relation.sourceNote.title || "Untitled note"}
                  </div>
                  <div className="mt-1">related to</div>
                  <div className="font-medium text-gray-900">
                    {relation.targetNote.title || "Untitled note"}
                  </div>
                  <div className="mt-1 text-blue-700">Score: {relation.score.toFixed(2)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-sm mb-3">Needs Clarification</h3>
          {lowConfidenceNotes.length === 0 ? (
            <p className="text-xs text-gray-600">No low-confidence notes right now.</p>
          ) : (
            <ul className="space-y-2">
              {lowConfidenceNotes.map((note) => {
                const meta = (note.aiMeta || {}) as { clarificationQuestions?: string[] };
                const question = Array.isArray(meta.clarificationQuestions) && meta.clarificationQuestions.length > 0
                  ? meta.clarificationQuestions[0]
                  : null;

                return (
                  <li key={note.id} className="rounded border border-amber-200 bg-amber-50 p-3">
                    <a href={`/notes/${note.id}`} className="text-xs font-medium text-amber-900 hover:underline">
                      {note.title || "Untitled note"}
                    </a>
                    {question && <p className="mt-1 text-[11px] text-amber-800">{question}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-sm mb-3">Priority Queue</h3>
          {highPriorityNotes.length === 0 ? (
            <p className="text-xs text-gray-600">No high-priority notes pending.</p>
          ) : (
            <ul className="space-y-2">
              {highPriorityNotes.map((note) => {
                const meta = (note.aiMeta || {}) as { nextAction?: string };

                return (
                  <li key={note.id} className="rounded border border-red-200 bg-red-50 p-3">
                    <a href={`/notes/${note.id}`} className="text-xs font-medium text-red-900 hover:underline">
                      {note.title || "Untitled note"}
                    </a>
                    {meta.nextAction && <p className="mt-1 text-[11px] text-red-800">Next: {meta.nextAction}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
