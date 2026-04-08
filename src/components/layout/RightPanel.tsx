import { auth } from "@/auth";
import { getUserReclassificationCandidates } from "@/lib/clusters";
import { prisma } from "@/lib/db";
import ReclassificationQueue from "@/components/notes/ReclassificationQueue";
import RightPanelContextual from "@/components/layout/RightPanelContextual";
import RightPanelShell from "@/components/layout/RightPanelShell";
import ResurfacingRail from "@/components/notes/ResurfacingRail";
import TimeResurfacingWidget from "@/components/notes/TimeResurfacingWidget";
import { getUserForgottenNoteCandidates, getUserReviewPatterns } from "@/lib/resurfacing";
import { getThinkingMemory, isReviewItemSuppressed } from "@/lib/userMemory";
import { getNoteHealthAssessment, summarizeWorkspaceHealth } from "@/lib/noteHealth";
import { getFirstClarificationQuestion, getPriorityQueueItems } from "@/lib/rightPanelQueues";
import { buildTimeResurfacingSummary } from "@/lib/timeResurfacing";

/**
 * Right panel showing live note health, active queues, and recent extracted tasks.
 * Collapses when there is nothing actionable to show.
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
        tags: true,
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
        confidenceScore: { lt: 0.5 },
      },
      orderBy: [{ confidenceScore: "asc" }, { updatedAt: "desc" }],
      take: 3,
      select: {
        id: true,
        title: true,
        aiMeta: true,
        confidenceScore: true,
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
      take: 20,
      select: {
        id: true,
        title: true,
        extractedTasks: true,
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
  const priorityQueueItems = getPriorityQueueItems(highPriorityNotes, 3);
  const timeResurfacingSummary = buildTimeResurfacingSummary(healthNotes, {
    reviewPatterns: visibleReviewPatterns,
    reclassificationCount: reclassificationCandidates.length,
  });

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

  // Determine if there's anything actionable to show
  const hasActionableContent =
    reclassificationCandidates.length > 0 ||
    priorityQueueItems.length > 0 ||
    extractedTasks.length > 0 ||
    lowConfidenceNotes.length > 0 ||
    atRiskNotes.length > 0 ||
    visibleForgottenCandidates.length > 0 ||
    visibleReviewPatterns.length > 0 ||
    topRelations.length > 0;

  return (
    <RightPanelShell hasContent={hasActionableContent}>
      <RightPanelContextual />

      {reclassificationCandidates.length > 0 && (
        <ReclassificationQueue
          candidates={reclassificationCandidates}
          compact
          title="Changed Meaning"
        />
      )}

      {priorityQueueItems.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Priority Tasks</h3>
          <ul className="space-y-2">
            {priorityQueueItems.map((task, index) => (
              <li key={`${task.noteId}-${index}`} className="rounded border border-red-200 bg-red-50 p-3">
                <div className="text-xs font-medium text-red-900">{task.text}</div>
                <a href={`/notes/${task.noteId}`} className="mt-1 block text-[11px] text-red-800 hover:underline">
                  {task.noteTitle}
                </a>
                {task.dueDate && <p className="mt-1 text-[11px] text-red-700">Due: {task.dueDate}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lowConfidenceNotes.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Needs Clarification</h3>
          <ul className="space-y-2">
            {lowConfidenceNotes.map((note) => {
              const question = getFirstClarificationQuestion(note.aiMeta);
              return (
                <li key={note.id} className="rounded border border-amber-200 bg-amber-50 p-3">
                  <a href={`/notes/${note.id}`} className="text-xs font-medium text-amber-900 hover:underline">
                    {note.title || "Untitled note"}
                  </a>
                  <p className="mt-1 text-[11px] text-amber-700">
                    {Math.round((note.confidenceScore || 0) * 100)}% confidence
                  </p>
                  {question && <p className="mt-1 text-[11px] text-amber-800 italic">{question}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {atRiskNotes.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">At Risk</h3>
          <ul className="space-y-2">
            {atRiskNotes.map(({ note, assessment }) => (
              <li key={note.id} className="rounded border border-red-200 bg-red-50 p-3">
                <a href={`/notes/${note.id}`} className="text-xs font-medium text-red-900 hover:underline">
                  {note.title || "Untitled note"}
                </a>
                <p className="mt-1 text-[11px] text-red-800">{assessment.reasons[0] || "Needs attention soon."}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extractedTasks.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Extracted Tasks</h3>
          <ul className="space-y-2">
            {extractedTasks.map((task, index) => (
              <li key={`${task.noteId}-${index}`} className="rounded border border-gray-200 bg-white p-3">
                <div className="text-xs font-medium text-gray-900">{task.text}</div>
                <div className="mt-1 text-[11px] text-gray-500">{task.noteTitle}</div>
                {task.dueDate && <div className="mt-1 text-[11px] text-blue-700">Due: {task.dueDate}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(visibleForgottenCandidates.length > 0 || visibleReviewPatterns.length > 0) && (
        <ResurfacingRail
          forgottenCandidates={visibleForgottenCandidates}
          reviewPatterns={visibleReviewPatterns}
          compact
          title="Resurface"
        />
      )}

      <TimeResurfacingWidget summary={timeResurfacingSummary} />

      {topRelations.length > 0 && (
        <div>
          <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Related Notes</h3>
          <ul className="space-y-2">
            {topRelations.map((relation) => (
              <li key={relation.id} className="rounded border border-gray-200 bg-white p-3 text-[11px] text-gray-700">
                <div className="font-medium text-gray-900">{relation.sourceNote.title || "Untitled note"}</div>
                <div className="my-0.5 text-gray-400">related to</div>
                <div className="font-medium text-gray-900">{relation.targetNote.title || "Untitled note"}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Workspace stats — always last, always compact */}
      <div>
        <h3 className="font-semibold text-xs text-gray-500 uppercase tracking-wide mb-2">Workspace</h3>
        <ul className="space-y-1 text-xs text-gray-600">
          <li className="flex justify-between px-2 py-1 rounded bg-white border border-gray-100">
            <span>Active notes</span><strong className="text-gray-900">{totalNotes}</strong>
          </li>
          {uncategorizedCount > 0 && (
            <li className="flex justify-between px-2 py-1 rounded bg-amber-50 border border-amber-100">
              <span>Uncategorized</span><strong className="text-amber-800">{uncategorizedCount}</strong>
            </li>
          )}
          {processingCount > 0 && (
            <li className="flex justify-between px-2 py-1 rounded bg-blue-50 border border-blue-100">
              <span>Processing…</span><strong className="text-blue-800">{processingCount}</strong>
            </li>
          )}
        </ul>
      </div>
    </RightPanelShell>
  );
}
