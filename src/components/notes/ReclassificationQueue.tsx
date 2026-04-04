"use client";

import type { ReclassificationCandidate } from "@/lib/clusters";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ReclassificationQueueProps {
  candidates: ReclassificationCandidate[];
  compact?: boolean;
  showBatchActions?: boolean;
  title?: string;
}

/**
 * Display notes whose inferred project/category meaning likely changed and apply those updates in bulk.
 */
export default function ReclassificationQueue({
  candidates,
  compact = false,
  showBatchActions = false,
  title = "Needs Reclassification",
}: ReclassificationQueueProps) {
  const router = useRouter();
  const [activeCandidates, setActiveCandidates] = useState(candidates);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setActiveCandidates(candidates);
    setSelectedIds(new Set());
  }, [candidates]);

  if (activeCandidates.length === 0) {
    return null;
  }

  const toggleSelected = (noteId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  /** Apply one reclassification suggestion through the conversational clarify route. */
  const applyCandidate = async (candidate: ReclassificationCandidate) => {
    const response = await fetch(`/api/notes/${candidate.note.id}/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "Should this note be regrouped based on newer context?",
        answer: candidate.reason,
        projectHint: candidate.suggestedProject || undefined,
        contextHint: candidate.suggestedCategory || undefined,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to apply reclassification");
    }
  };

  /** Apply all selected reclassification suggestions in sequence and refresh the inbox. */
  const handleApplySelected = async () => {
    const selectedCandidates = activeCandidates.filter((candidate) => selectedIds.has(candidate.note.id));
    if (selectedCandidates.length === 0) {
      return;
    }

    setIsApplying(true);
    setMessage(null);

    try {
      for (const candidate of selectedCandidates) {
        await applyCandidate(candidate);
      }

      setMessage(`Applied ${selectedCandidates.length} reclassification suggestion${selectedCandidates.length === 1 ? "" : "s"}.`);
      setActiveCandidates((current) => current.filter((candidate) => !selectedIds.has(candidate.note.id)));
      setSelectedIds(new Set());
      router.refresh();
    } catch (error) {
      console.error("Error applying reclassification suggestions:", error);
      setMessage("Could not apply all reclassification suggestions.");
    } finally {
      setIsApplying(false);
    }
  };

  /** Apply one suggestion directly from its list item. */
  const handleApplyOne = async (candidate: ReclassificationCandidate) => {
    setIsApplying(true);
    setMessage(null);

    try {
      await applyCandidate(candidate);
      setMessage(`Applied reclassification for ${candidate.note.title || "Untitled note"}.`);
      setActiveCandidates((current) => current.filter((item) => item.note.id !== candidate.note.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(candidate.note.id);
        return next;
      });
      router.refresh();
    } catch (error) {
      console.error("Error applying reclassification suggestion:", error);
      setMessage("Could not apply this reclassification suggestion.");
    } finally {
      setIsApplying(false);
    }
  };

  /** Persist lightweight negative feedback for one reclassification suggestion and hide it from the queue. */
  const handleDismissOne = async (candidate: ReclassificationCandidate) => {
    setIsDismissing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/review/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "reclassification",
          targetId: candidate.feedbackKey,
          action: "dismiss",
          label: `${candidate.note.title || "Untitled note"} → ${candidate.suggestedProject || "keep project unset"}${candidate.suggestedCategory ? ` · ${candidate.suggestedCategory}` : ""}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to dismiss reclassification suggestion");
      }

      setMessage(`Dismissed reclassification for ${candidate.note.title || "Untitled note"}.`);
      setActiveCandidates((current) => current.filter((item) => item.feedbackKey !== candidate.feedbackKey));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(candidate.note.id);
        return next;
      });
      router.refresh();
    } catch (error) {
      console.error("Error dismissing reclassification suggestion:", error);
      setMessage("Could not dismiss this reclassification suggestion.");
    } finally {
      setIsDismissing(false);
    }
  };

  return (
    <div className={`rounded-lg border border-emerald-200 bg-emerald-50 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className={`font-semibold text-emerald-900 ${compact ? "text-xs" : "text-sm"}`}>{title}</h3>
          <p className="mt-1 text-[11px] text-emerald-800">
            These notes now have stronger project/category context based on newer linked notes.
          </p>
        </div>

        {showBatchActions && (
          <button
            type="button"
            onClick={handleApplySelected}
            disabled={isApplying || selectedIds.size === 0}
            className="shrink-0 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            {isApplying ? "Applying..." : `Apply selected${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
          </button>
        )}
      </div>

      {message && <p className="mt-3 text-[11px] text-emerald-800">{message}</p>}

      <ul className="mt-3 space-y-2">
        {activeCandidates.map((candidate) => (
          <li key={candidate.note.id} className="rounded-md border border-emerald-100 bg-white p-3">
            <div className="flex items-start gap-3">
              {showBatchActions && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(candidate.note.id)}
                  onChange={() => toggleSelected(candidate.note.id)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600"
                />
              )}

              <div className="min-w-0 flex-1">
                <Link href={`/notes/${candidate.note.id}`} className="text-sm font-medium text-emerald-950 hover:underline">
                  {candidate.note.title || "Untitled note"}
                </Link>
                <p className="mt-1 text-[11px] text-emerald-800">
                  {candidate.currentProject || candidate.currentCategory
                    ? `Currently ${candidate.currentProject ? `in ${candidate.currentProject}` : "unprojected"}${candidate.currentCategory ? ` · ${candidate.currentCategory}` : ""}`
                    : "Currently has weak project/category context"}
                </p>
                <p className="mt-1 text-[11px] text-emerald-900">
                  Suggest: {candidate.suggestedProject || "keep project unset"}
                  {candidate.suggestedCategory ? ` · ${candidate.suggestedCategory}` : ""}
                </p>
                <p className="mt-2 text-[11px] text-emerald-800">{candidate.reason}</p>

                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-emerald-700">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5">
                    {(candidate.confidence * 100).toFixed(0)}% confidence
                  </span>
                  {candidate.changedByNewerContext && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                      newer context changed this
                    </span>
                  )}
                  {candidate.clarificationTurns > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                      {candidate.clarificationTurns} clarification turn{candidate.clarificationTurns === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {candidate.supportingNotes.length > 0 && !compact && (
                  <div className="mt-3">
                    <p className="text-[11px] font-medium text-emerald-800">Supporting notes</p>
                    <ul className="mt-1 space-y-1">
                      {candidate.supportingNotes.slice(0, 3).map((support) => (
                        <li key={support.id}>
                          <Link href={`/notes/${support.id}`} className="text-[11px] text-emerald-700 hover:underline">
                            {support.title || "Untitled note"}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => void handleApplyOne(candidate)}
                disabled={isApplying || isDismissing}
                className="shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
              >
                Apply
              </button>

              <button
                type="button"
                onClick={() => void handleDismissOne(candidate)}
                disabled={isApplying || isDismissing}
                className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {isDismissing ? "Saving..." : "Not useful"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}