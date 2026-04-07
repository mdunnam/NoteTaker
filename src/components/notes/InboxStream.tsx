/**
 * Inbox stream - shows notes in a vertical list for triage
 */

"use client";

import type { ReclassificationCandidate } from "@/lib/clusters";
import type { ForgottenNoteCandidate, ReviewPatternCandidate } from "@/lib/resurfacing";
import { Note } from "@prisma/client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2 } from "lucide-react";
import NoteCard from "./NoteCard";
import ReclassificationQueue from "./ReclassificationQueue";
import ResurfacingRail from "./ResurfacingRail";

interface InboxStreamProps {
  notes: (Note & {
    collection: { id: string; name: string; color?: string | null } | null;
    entities: Array<{ entity: { id: string; name: string; type: string } }>;
  })[];
  reclassificationCandidates?: ReclassificationCandidate[];
  forgottenCandidates?: ForgottenNoteCandidate[];
  reviewPatterns?: ReviewPatternCandidate[];
  quickHints?: {
    projects: string[];
    contexts: string[];
  };
}

export default function InboxStream({ notes, reclassificationCandidates, forgottenCandidates, reviewPatterns, quickHints }: InboxStreamProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProjectHint, setBulkProjectHint] = useState("");
  const [bulkContextHint, setBulkContextHint] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [shortcutMessage, setShortcutMessage] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const focusedNote = notes[focusedIndex] || null;

  /** Toggle a single note in the selection set. */
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /** Select all or deselect all notes. */
  const toggleSelectAll = () => {
    if (selected.size === notes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(notes.map((n) => n.id)));
    }
  };

  /**
   * Apply a PATCH operation to all selected notes.
   */
  const bulkPatch = async (patch: Record<string, unknown>) => {
    setIsBulkProcessing(true);
    try {
      await Promise.all(
        [...selected].map((id) =>
          fetch(`/api/notes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          })
        )
      );
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      console.error("Bulk operation failed:", error);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  /**
   * Delete all selected notes.
   */
  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} note${selected.size === 1 ? "" : "s"} permanently?`)) return;
    setIsBulkProcessing(true);
    try {
      await Promise.all(
        [...selected].map((id) => fetch(`/api/notes/${id}`, { method: "DELETE" }))
      );
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      console.error("Bulk delete failed:", error);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  /**
   * Apply a shared project/context hint to selected notes and regenerate AI organization.
   */
  const bulkClarify = async () => {
    if (selected.size === 0) return;
    if (!bulkProjectHint && !bulkContextHint) return;

    setIsBulkProcessing(true);
    try {
      await Promise.all(
        [...selected].map((id) =>
          fetch(`/api/notes/${id}/summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectHint: bulkProjectHint || undefined,
              contextHint: bulkContextHint || undefined,
            }),
          })
        )
      );
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      console.error("Bulk clarify failed:", error);
    } finally {
      setIsBulkProcessing(false);
    }
  };

  /** Set small transient message for keyboard triage feedback. */
  const flashMessage = useCallback((text: string) => {
    setShortcutMessage(text);
    setTimeout(() => setShortcutMessage(null), 2000);
  }, []);

  /** Apply a patch to one note by id. */
  const patchOne = useCallback(async (id: string, patch: Record<string, unknown>) => {
    await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, []);

  /** Perform keyboard-first triage actions for focused card. */
  const handleShortcutAction = useCallback(async (key: string) => {
    if (!focusedNote) return;

    if (key === "a") {
      await fetch(`/api/notes/${focusedNote.id}/summary`, { method: "POST" });
      flashMessage("Accepted AI suggestions (regenerated summary).");
      router.refresh();
      return;
    }

    if (key === "e") {
      router.push(`/notes/${focusedNote.id}`);
      return;
    }

    if (key === "s") {
      const response = await fetch(`/api/notes/${focusedNote.id}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", maxNotes: 8 }),
      });

      if (response.ok) {
        const payload = (await response.json()) as { count?: number };
        flashMessage(`Split created ${payload.count || 0} note${payload.count === 1 ? "" : "s"}.`);
      } else {
        flashMessage("Split failed.");
      }
      router.refresh();
      return;
    }

    if (key === "p") {
      await patchOne(focusedNote.id, { isPinned: !focusedNote.isPinned });
      flashMessage(focusedNote.isPinned ? "Unpinned." : "Pinned.");
      router.refresh();
      return;
    }

    if (key === "d") {
      if (!confirm("Delete focused note permanently?")) return;
      await fetch(`/api/notes/${focusedNote.id}`, { method: "DELETE" });
      flashMessage("Deleted note.");
      router.refresh();
    }
  }, [flashMessage, focusedNote, patchOne, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isInput =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        !!target?.isContentEditable;

      if (isInput) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "?") {
        event.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      if (key === "arrowright" || key === "j") {
        event.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, notes.length - 1));
        return;
      }

      if (key === "arrowleft" || key === "k") {
        event.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (["a", "e", "s", "p", "d"].includes(key)) {
        event.preventDefault();
        void handleShortcutAction(key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleShortcutAction, notes.length]);

  if (notes.length === 0) {
    return (
      <div className="mt-8 max-w-xl">
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <span className="text-2xl">⚡</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Type anything above and hit Save</h2>
          <p className="text-sm text-gray-500 mb-4">
            Meeting notes, stray ideas, tasks, links, brain dumps — whatever it is, just get it in. QNote’s AI will automatically title, summarize, tag, and group it so you don’t have to.
          </p>
          <div className="grid grid-cols-3 gap-3 text-xs text-gray-500">
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-base mb-1">✍️</div>
              <div className="font-medium text-gray-700">Capture</div>
              <div>Type or paste anything</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-base mb-1">🤖</div>
              <div className="font-medium text-gray-700">AI Organizes</div>
              <div>Titles, tags &amp; categories auto-generated</div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <div className="text-base mb-1">🔍</div>
              <div className="font-medium text-gray-700">Resurface</div>
              <div>Find it later, instantly</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const allSelected = notes.length > 0 && selected.size === notes.length;
  const someSelected = selected.size > 0;

  return (
    <div className="max-w-3xl">
      {!!reclassificationCandidates?.length && (
        <div className="mb-4">
          <ReclassificationQueue candidates={reclassificationCandidates} showBatchActions title="Reclassification Queue" />
        </div>
      )}

      {((forgottenCandidates?.length || 0) > 0 || (reviewPatterns?.length || 0) > 0) && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm font-semibold text-indigo-900">Resurfacing alerts</p>
          <p className="mt-1 text-xs text-indigo-800">
            QNote found {(forgottenCandidates?.length || 0) + (reviewPatterns?.length || 0)} resurfacing signal{(forgottenCandidates?.length || 0) + (reviewPatterns?.length || 0) === 1 ? "" : "s"} outside Review.
          </p>
        </div>
      )}

      {((forgottenCandidates?.length || 0) > 0 || (reviewPatterns?.length || 0) > 0) && (
        <div className="mb-4">
          <ResurfacingRail
            forgottenCandidates={forgottenCandidates || []}
            reviewPatterns={reviewPatterns || []}
            title="Inbox resurfacing"
          />
        </div>
      )}

      {showShortcuts && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
          <p className="font-semibold mb-1">Triage shortcuts</p>
          <p><strong>A</strong> accept AI, <strong>E</strong> edit note, <strong>S</strong> split, <strong>P</strong> pin, <strong>D</strong> delete</p>
          <p><strong>→</strong>/<strong>J</strong> next, <strong>←</strong>/<strong>K</strong> previous, <strong>?</strong> toggle help</p>
        </div>
      )}

      {shortcutMessage && (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-xs text-green-800">
          {shortcutMessage}
        </div>
      )}

      {/* Bulk action toolbar */}
      <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
          title="Select all"
        />
        {someSelected ? (
          <>
            <span className="text-gray-600">{selected.size} selected</span>
            {(quickHints?.projects?.length || quickHints?.contexts?.length) && (
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={bulkProjectHint}
                  onChange={(e) => setBulkProjectHint(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="">Project hint...</option>
                  {(quickHints?.projects || []).map((project) => (
                    <option key={`bulk-project-${project}`} value={project}>{project}</option>
                  ))}
                </select>

                <select
                  value={bulkContextHint}
                  onChange={(e) => setBulkContextHint(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="">Context hint...</option>
                  {(quickHints?.contexts || []).map((context) => (
                    <option key={`bulk-context-${context}`} value={context}>{context}</option>
                  ))}
                </select>

                <button
                  onClick={bulkClarify}
                  disabled={isBulkProcessing || (!bulkProjectHint && !bulkContextHint)}
                  className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                >
                  Clarify + Regenerate
                </button>
              </div>
            )}
            <button
              onClick={() => bulkPatch({ isArchived: true })}
              disabled={isBulkProcessing}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </button>
            <button
              onClick={bulkDelete}
              disabled={isBulkProcessing}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </>
        ) : (
          <span className="text-gray-400 text-xs">Select notes for bulk actions</span>
        )}
      </div>

      <div className="space-y-3">
        {notes.map((note, index) => (
          <div
            key={note.id}
            className={`flex items-start gap-3 rounded-lg px-1 py-1 ${index === focusedIndex ? "ring-2 ring-blue-300" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected.has(note.id)}
              onChange={() => toggleSelect(note.id)}
              className="mt-5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
            />
            <div className="flex-1 min-w-0">
              <NoteCard note={note} quickHints={quickHints} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
