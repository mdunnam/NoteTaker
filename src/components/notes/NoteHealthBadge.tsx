import type { NoteHealthAssessment } from "@/lib/noteHealth";

interface NoteHealthBadgeProps {
  assessment: NoteHealthAssessment;
}

/** Compact badge for note-health state. */
export default function NoteHealthBadge({ assessment }: NoteHealthBadgeProps) {
  const className = assessment.state === "healthy"
    ? "bg-green-100 text-green-700"
    : assessment.state === "watch"
      ? "bg-amber-100 text-amber-800"
      : "bg-red-100 text-red-700";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {assessment.label} · {assessment.score}
    </span>
  );
}