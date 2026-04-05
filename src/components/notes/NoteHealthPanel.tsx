import type { NoteHealthAssessment } from "@/lib/noteHealth";
import NoteHealthBadge from "@/components/notes/NoteHealthBadge";

interface NoteHealthPanelProps {
  assessment: NoteHealthAssessment;
  compact?: boolean;
}

/** Detailed note-health widget for note detail, cards, and side panels. */
export default function NoteHealthPanel({ assessment, compact = false }: NoteHealthPanelProps) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`font-semibold text-gray-900 ${compact ? "text-xs" : "text-sm"}`}>Note Health</p>
          <p className={`text-gray-600 ${compact ? "text-[11px]" : "text-xs"}`}>
            Tracks confidence, staleness, missing structure, and unresolved clarification pressure.
          </p>
        </div>
        <NoteHealthBadge assessment={assessment} />
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Stale</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{assessment.staleDays}d</p>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Tasks</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{assessment.extractedTaskCount}</p>
        </div>
        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Clarify</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{assessment.needsClarification ? "Open" : "Clear"}</p>
        </div>
      </div>

      {assessment.reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {assessment.reasons.map((reason) => (
            <li key={reason} className={`text-gray-700 ${compact ? "text-[11px]" : "text-xs"}`}>
              • {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}