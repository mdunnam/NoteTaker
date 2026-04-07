import Link from "next/link";

import type { TimeResurfacingSummary } from "@/lib/timeResurfacing";

interface TimeResurfacingWidgetProps {
  summary: TimeResurfacingSummary;
}

/** Compact in-app resurfacing widget for today's tasks, today's connections, and weekly signals. */
export default function TimeResurfacingWidget({ summary }: TimeResurfacingWidgetProps) {
  const hasContent =
    summary.todayTasks.length > 0 ||
    summary.todayConnections.length > 0 ||
    summary.weeklyThreads.length > 0 ||
    summary.weeklyPatternCount > 0 ||
    summary.weeklyRegroupingCount > 0;

  if (!hasContent) {
    return null;
  }

  return (
    <section className="pt-6 border-t border-gray-200 space-y-4">
      <div>
        <h3 className="font-semibold text-sm text-gray-900">Time-Based Resurfacing</h3>
        <p className="mt-1 text-[11px] text-gray-600">
          Daily and weekly nudges based on what you captured most recently.
        </p>
      </div>

      {summary.todayTasks.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-blue-700">Today&apos;s Tasks</p>
          <ul className="space-y-2">
            {summary.todayTasks.map((task, index) => (
              <li key={`${task.noteId}-${index}`} className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="text-xs font-medium text-blue-900">{task.text}</div>
                <Link href={`/notes/${task.noteId}`} className="mt-1 block text-[11px] text-blue-800 hover:underline">
                  {task.noteTitle}
                </Link>
                {task.dueDate && <p className="mt-1 text-[11px] text-blue-700">Due: {task.dueDate}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.todayConnections.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Ideas From Today Might Connect</p>
          <ul className="space-y-2">
            {summary.todayConnections.map((connection) => (
              <li key={`${connection.kind}-${connection.label}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-900">{connection.label}</p>
                <p className="mt-1 text-[11px] text-amber-800">{connection.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {connection.notes.map((note) => (
                    <Link
                      key={note.id}
                      href={`/notes/${note.id}`}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:underline"
                    >
                      {note.title || "Untitled note"}
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-purple-700">This Week</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Patterns</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{summary.weeklyPatternCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Regroupings</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{summary.weeklyRegroupingCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Threads</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">{summary.weeklyThreads.length}</p>
          </div>
        </div>

        {summary.weeklyThreads.length > 0 && (
          <ul className="mt-3 space-y-2">
            {summary.weeklyThreads.map((thread) => (
              <li key={`${thread.kind}-${thread.label}`} className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                <p className="text-xs font-medium text-purple-900">{thread.label}</p>
                <p className="mt-1 text-[11px] text-purple-800">{thread.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}