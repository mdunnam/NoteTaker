"use client";

import { useMemo, useState } from "react";
import MultiNoteSynthesisPanel from "@/components/notes/MultiNoteSynthesisPanel";
import NoteCard, { type NoteData } from "@/components/notes/NoteCard";
import NoteHealthBadge from "@/components/notes/NoteHealthBadge";
import { getNoteHealthAssessment, summarizeWorkspaceHealth } from "@/lib/noteHealth";

interface CardsClientProps {
  notes: NoteData[];
  filterOptions: {
    categories: string[];
    projects: string[];
    types: string[];
  };
}

/** Richer cards surface with local filtering, selection, health, and synthesis. */
export default function CardsClient({ notes, filterOptions }: CardsClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [project, setProject] = useState("");
  const [type, setType] = useState("");
  const [health, setHealth] = useState<"all" | "healthy" | "watch" | "at-risk">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "health" | "priority">("newest");

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
        (!type || note.type === type) &&
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
        return leftPriority - rightPriority || right.createdAt.getTime() - left.createdAt.getTime();
      }

      return right.createdAt.getTime() - left.createdAt.getTime();
    });

    return sorted;
  }, [category, health, notes, project, search, sortBy, type]);

  const workspaceHealth = useMemo(() => summarizeWorkspaceHealth(filteredNotes), [filteredNotes]);
  const selectedNotes = filteredNotes.filter((note) => selectedIds.has(note.id));

  /** Toggle one card in the synthesis selection set. */
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
          <p className="text-xs uppercase tracking-wide text-gray-500">Visible cards</p>
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
          <p className="text-xs uppercase tracking-wide text-red-700">At risk</p>
          <p className="mt-1 text-2xl font-bold text-red-900">{workspaceHealth.atRiskCount}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search cards..."
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
          <select value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All types</option>
            {filterOptions.types.map((value) => <option key={value} value={value}>{value}</option>)}
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

      <MultiNoteSynthesisPanel
        notes={selectedNotes.map((note) => ({ id: note.id, title: note.title }))}
        title="Synthesize selected cards"
        description="Pull a shared thread, actions, and open questions out of the cards you selected."
      />

      {filteredNotes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-600">
          No cards match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredNotes.map((note) => {
            const assessment = getNoteHealthAssessment(note);

            return (
              <div key={note.id} className="rounded-xl border border-transparent bg-transparent">
                <div className="mb-2 flex items-center justify-between gap-3 px-1">
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(note.id)}
                      onChange={() => toggleSelected(note.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    Select
                  </label>
                  <NoteHealthBadge assessment={assessment} />
                </div>
                <NoteCard note={note} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}