"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import MultiNoteSynthesisPanel from "@/components/notes/MultiNoteSynthesisPanel";
import NoteCard, { type NoteData } from "@/components/notes/NoteCard";
import { getNoteHealthAssessment, summarizeWorkspaceHealth } from "@/lib/noteHealth";

type SavedNotesMode = "favorites" | "archive";

interface SavedNotesClientProps {
  notes: NoteData[];
  mode: SavedNotesMode;
}

interface ScoredNote {
  note: NoteData;
  score: number;
  reason: string;
  staleDays: number;
  taskCount: number;
}

function getModeCopy(mode: SavedNotesMode) {
  return mode === "favorites"
    ? {
        searchPlaceholder: "Search favorite notes...",
        synthesisTitle: "Synthesize favorite notes",
        synthesisDescription: "Turn your selected pinned notes into one shared overview and next-step list.",
        actionTitle: "Needs a second look",
        actionDescription: "Pinned notes that still carry stale or low-confidence pressure.",
        actionCountLabel: "Needs attention",
        layoutLabel: "Favorite layout",
      }
    : {
        searchPlaceholder: "Search archived notes...",
        synthesisTitle: "Synthesize archived notes",
        synthesisDescription: "Find the shared thread across archived notes before deciding what should come back into the active loop.",
        actionTitle: "Restore candidates",
        actionDescription: "Archived notes that still look actionable, stale, or structurally weak enough to revisit.",
        actionCountLabel: "Restore candidates",
        layoutLabel: "Archive layout",
      };
}

/** Richer saved-notes surface for Favorites and Archive. */
export default function SavedNotesClient({ notes, mode }: SavedNotesClientProps) {
  const copy = getModeCopy(mode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [project, setProject] = useState("");
  const [health, setHealth] = useState<"all" | "healthy" | "watch" | "at-risk">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "health" | "priority">(
    mode === "archive" ? "health" : "priority"
  );
  const [layout, setLayout] = useState<"grid" | "list">(mode === "favorites" ? "grid" : "list");

  const filterOptions = useMemo(() => {
    return {
      categories: [...new Set(notes.map((note) => note.category).filter(Boolean))] as string[],
      projects: [...new Set(notes.map((note) => note.suggestedProject).filter(Boolean))] as string[],
    };
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const visible = notes.filter((note) => {
      const assessment = getNoteHealthAssessment(note);
      const haystack = [
        note.title || "",
        note.summary || "",
        note.rawContent,
        note.category || "",
        note.suggestedProject || "",
        ...note.tags,
      ].join(" ").toLowerCase();

      return (!normalizedSearch || haystack.includes(normalizedSearch)) &&
        (!category || note.category === category) &&
        (!project || note.suggestedProject === project) &&
        (health === "all" || assessment.state === health);
    });

    const sorted = [...visible];
    sorted.sort((left, right) => {
      if (sortBy === "oldest") {
        return left.createdAt.getTime() - right.createdAt.getTime();
      }

      if (sortBy === "health") {
        return getNoteHealthAssessment(left).score - getNoteHealthAssessment(right).score;
      }

      if (sortBy === "priority") {
        const rank = { high: 0, medium: 1, low: 2, null: 3 } as const;
        const leftPriority = rank[(left.priority as keyof typeof rank) || "null"];
        const rightPriority = rank[(right.priority as keyof typeof rank) || "null"];
        return leftPriority - rightPriority || right.updatedAt.getTime() - left.updatedAt.getTime();
      }

      return right.createdAt.getTime() - left.createdAt.getTime();
    });

    return sorted;
  }, [category, health, notes, project, search, sortBy]);

  const selectedNotes = filteredNotes.filter((note) => selectedIds.has(note.id));
  const workspaceHealth = useMemo(() => summarizeWorkspaceHealth(filteredNotes), [filteredNotes]);
  const actionableCandidates = useMemo<ScoredNote[]>(() => {
    return filteredNotes
      .map((note) => {
        const assessment = getNoteHealthAssessment(note);
        return {
          note,
          score: assessment.score,
          reason: assessment.reasons[0] || (mode === "archive" ? "May be worth restoring." : "Still worth revisiting."),
          staleDays: assessment.staleDays,
          taskCount: assessment.extractedTaskCount,
        };
      })
      .filter((entry) => entry.score < 75 || entry.taskCount > 0 || entry.note.priority === "high")
      .sort((left, right) => left.score - right.score || right.staleDays - left.staleDays)
      .slice(0, 3);
  }, [filteredNotes, mode]);

  /** Toggle one note in the synthesis selection set. */
  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
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
          <p className="mt-1 text-2xl font-bold text-gray-900">{workspaceHealth.averageScore}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-700">Watch</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{workspaceHealth.watchCount}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs uppercase tracking-wide text-red-700">{copy.actionCountLabel}</p>
          <p className="mt-1 text-2xl font-bold text-red-900">{actionableCandidates.length}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          />
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All categories</option>
            {filterOptions.categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={project} onChange={(event) => setProject(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All projects</option>
            {filterOptions.projects.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={health} onChange={(event) => setHealth(event.target.value as typeof health)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">All health</option>
            <option value="healthy">Healthy</option>
            <option value="watch">Watch</option>
            <option value="at-risk">At risk</option>
          </select>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="health">Lowest health first</option>
            <option value="priority">Priority first</option>
          </select>
          <select value={layout} onChange={(event) => setLayout(event.target.value as typeof layout)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="grid">{copy.layoutLabel}: Grid</option>
            <option value="list">{copy.layoutLabel}: List</option>
          </select>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set(filteredNotes.map((note) => note.id)))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Select visible
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear selection
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <MultiNoteSynthesisPanel
          notes={selectedNotes.map((note) => ({ id: note.id, title: note.title }))}
          title={copy.synthesisTitle}
          description={copy.synthesisDescription}
        />

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">{copy.actionTitle}</h3>
          <p className="mt-1 text-xs text-gray-600">{copy.actionDescription}</p>

          {actionableCandidates.length === 0 ? (
            <p className="mt-3 text-xs text-gray-500">Nothing stands out right now.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {actionableCandidates.map((candidate) => (
                <li key={candidate.note.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <Link href={`/notes/${candidate.note.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline">
                    {candidate.note.title || "Untitled note"}
                  </Link>
                  <p className="mt-1 text-xs text-gray-700">{candidate.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                    <span>{candidate.staleDays}d stale</span>
                    {candidate.taskCount > 0 && <span>{candidate.taskCount} task{candidate.taskCount === 1 ? "" : "s"}</span>}
                    {candidate.note.suggestedProject && <span>{candidate.note.suggestedProject}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {filteredNotes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-600">
          No saved notes match the current filters.
        </div>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredNotes.map((note) => (
            <div key={note.id} className="rounded-xl border border-transparent bg-transparent">
              <label className="mb-2 flex items-center gap-2 px-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={selectedIds.has(note.id)}
                  onChange={() => toggleSelected(note.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                Select
              </label>
              <NoteCard note={note} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl">
          {filteredNotes.map((note) => (
            <div key={note.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <label className="mb-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={selectedIds.has(note.id)}
                  onChange={() => toggleSelected(note.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                Select
              </label>
              <NoteCard note={note} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}