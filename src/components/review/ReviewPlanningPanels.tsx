"use client";

import MultiNoteSynthesisPanel, { type SynthesisSelectableNote } from "@/components/notes/MultiNoteSynthesisPanel";

interface PreviewNote {
  id: string;
  title: string | null;
}

interface ReviewPlanningPanelsProps {
  lowConfidenceNotes: PreviewNote[];
  reclassificationCandidates: Array<{
    note: PreviewNote;
    suggestedProject: string | null;
    suggestedCategory: string | null;
    supportingNotes: PreviewNote[];
  }>;
  forgottenCandidates: Array<{
    note: PreviewNote;
  }>;
  reviewPatterns: Array<{
    id: string;
    label: string;
    kind: "project" | "topic" | "idea";
    supportingNotes: PreviewNote[];
  }>;
}

function dedupeNotes(notes: PreviewNote[]): SynthesisSelectableNote[] {
  return [...new Map(notes.map((note) => [note.id, { id: note.id, title: note.title }])).values()];
}

/** Queue-level planning surfaces layered on top of the existing review data. */
export default function ReviewPlanningPanels({
  lowConfidenceNotes,
  reclassificationCandidates,
  forgottenCandidates,
  reviewPatterns,
}: ReviewPlanningPanelsProps) {
  const clarificationNotes = dedupeNotes(lowConfidenceNotes);
  const regroupingNotes = dedupeNotes([
    ...reclassificationCandidates.map((candidate) => candidate.note),
    ...reclassificationCandidates.flatMap((candidate) => candidate.supportingNotes),
  ]);
  const resurfacingNotes = dedupeNotes([
    ...forgottenCandidates.map((candidate) => candidate.note),
    ...reviewPatterns.flatMap((pattern) => pattern.supportingNotes),
  ]);
  const overallNotes = dedupeNotes([
    ...clarificationNotes,
    ...regroupingNotes,
    ...resurfacingNotes,
  ]);

  const visiblePanels = [
    overallNotes.length >= 2,
    clarificationNotes.length >= 2,
    regroupingNotes.length >= 2,
    resurfacingNotes.length >= 2,
  ].filter(Boolean).length;

  if (visiblePanels === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Plan The Review Queue</h2>
        <p className="mt-1 text-sm text-gray-600">
          Turn clarification, regrouping, and resurfacing work into a concrete plan instead of handling the queue one item at a time.
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${visiblePanels > 1 ? "xl:grid-cols-2" : ""}`}>
        {overallNotes.length >= 2 && (
          <MultiNoteSynthesisPanel
            notes={overallNotes}
            title="Plan this review pass"
            description="Synthesize the visible review queues into one plan for the current cleanup session."
            planningGoalPlaceholder="Optional planning lens: clear this queue this week, unblock a launch, prep a review session..."
          />
        )}

        {clarificationNotes.length >= 2 && (
          <MultiNoteSynthesisPanel
            notes={clarificationNotes}
            title="Plan clarification work"
            description="Turn low-confidence notes into a concrete clarification sequence and next-step plan."
            planningGoalPlaceholder="Optional planning lens: resolve ambiguity fast, clarify before Friday, clean up note confidence..."
          />
        )}

        {regroupingNotes.length >= 2 && (
          <MultiNoteSynthesisPanel
            notes={regroupingNotes}
            title="Plan regrouping work"
            description="Use changed-meaning notes and their supporting context to plan the next reorganization pass."
            planningGoalPlaceholder="Optional planning lens: merge context, reclassify this batch, prep a project cleanup pass..."
          />
        )}

        {resurfacingNotes.length >= 2 && (
          <MultiNoteSynthesisPanel
            notes={resurfacingNotes}
            title="Plan resurfaced work"
            description="Turn forgotten notes and recurring themes into one follow-up plan before they drift again."
            planningGoalPlaceholder="Optional planning lens: recover stalled work, choose what to revive, prune old threads..."
          />
        )}
      </div>
    </section>
  );
}