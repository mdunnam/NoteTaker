"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import MultiNoteSynthesisPanel from "@/components/notes/MultiNoteSynthesisPanel";
import NoteHealthBadge from "@/components/notes/NoteHealthBadge";
import { getNoteHealthAssessment, summarizeWorkspaceHealth } from "@/lib/noteHealth";

interface TimelineNoteData {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: Date;
  updatedAt: Date;
  category: string | null;
  type: string | null;
  status: string;
  confidenceScore: number | null;
  priority: string | null;
  suggestedProject: string | null;
  extractedTasks: unknown;
  aiMeta: unknown;
}

interface TimelineClientProps {
  notes: TimelineNoteData[];
}

/** Timeline surface with health filtering, bucket selection, and synthesis across time windows. */
export default function TimelineClient({ notes }: TimelineClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<"all" | "30d" | "90d" | "365d">("all");
  const [health, setHealth] = useState<"all" | "healthy" | "watch" | "at-risk">("all");

  const filteredNotes = useMemo(() => {
    const now = new Date();
    const rangeCutoff = dateRange === "all"
      ? null
      : new Date(now.getTime() - Number.parseInt(dateRange, 10) * 24 * 60 * 60 * 1000);

    return notes.filter((note) => {
      const assessment = getNoteHealthAssessment(note, now);
      return (!rangeCutoff || note.createdAt >= rangeCutoff) && (health === "all" || assessment.state === health);
    });
  }, [dateRange, health, notes]);

  const groupedNotes = useMemo(() => {
    return filteredNotes.reduce<Record<string, TimelineNoteData[]>>((accumulator, note) => {
      const key = new Date(note.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      accumulator[key] = accumulator[key] || [];
      accumulator[key].push(note);
      return accumulator;
    }, {});
  }, [filteredNotes]);

  const selectedNotes = filteredNotes.filter((note) => selectedIds.has(note.id));
  const healthSummary = useMemo(() => summarizeWorkspaceHealth(filteredNotes), [filteredNotes]);

  /** Toggle selection for all notes inside one month bucket. */
  const toggleBucket = (bucketNotes: TimelineNoteData[]) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const shouldSelect = bucketNotes.some((note) => !next.has(note.id));

      for (const note of bucketNotes) {
        if (shouldSelect) {
          next.add(note.id);
        } else {
          next.delete(note.id);
        }
      }

      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Visible notes</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{filteredNotes.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Avg health</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{healthSummary.averageScore}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-700">Watch</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{healthSummary.watchCount}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs uppercase tracking-wide text-red-700">At risk</p>
          <p className="mt-1 text-2xl font-bold text-red-900">{healthSummary.atRiskCount}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          <select value={dateRange} onChange={(event) => setDateRange(event.target.value as typeof dateRange)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="365d">Last year</option>
          </select>
          <select value={health} onChange={(event) => setHealth(event.target.value as typeof health)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">All health</option>
            <option value="healthy">Healthy</option>
            <option value="watch">Watch</option>
            <option value="at-risk">At risk</option>
          </select>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear selection
          </button>
        </div>
      </div>

      <MultiNoteSynthesisPanel
        notes={selectedNotes.map((note) => ({ id: note.id, title: note.title }))}
        title="Synthesize selected timeline notes"
        description="Turn a time bucket or selected set into one planning summary."
      />

      {Object.keys(groupedNotes).length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-600">
          No timeline notes match the current filters.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedNotes).map(([bucket, bucketNotes]) => {
            const bucketSummary = summarizeWorkspaceHealth(bucketNotes);

            return (
              <section key={bucket} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{bucket}</h2>
                    <p className="text-xs text-gray-600">
                      {bucketNotes.length} notes · avg health {bucketSummary.averageScore} · {bucketSummary.atRiskCount} at risk
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBucket(bucketNotes)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Toggle month selection
                  </button>
                </div>

                <ul className="space-y-3">
                  {bucketNotes.map((note) => {
                    const assessment = getNoteHealthAssessment(note);

                    return (
                      <li key={note.id} className="rounded-lg border border-gray-100 p-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(note.id)}
                            onChange={() => setSelectedIds((current) => {
                              const next = new Set(current);
                              if (next.has(note.id)) {
                                next.delete(note.id);
                              } else {
                                next.add(note.id);
                              }
                              return next;
                            })}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/notes/${note.id}`} className="text-sm font-semibold text-gray-900 hover:text-blue-700 hover:underline">
                                {note.title || "Untitled note"}
                              </Link>
                              <NoteHealthBadge assessment={assessment} />
                            </div>
                            <p className="mt-1 text-sm text-gray-700 line-clamp-2">{note.summary || note.rawContent}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                              <span>{new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                              {note.suggestedProject && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{note.suggestedProject}</span>}
                              {note.category && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700">{note.category}</span>}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}