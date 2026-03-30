/**
 * Inbox stream - shows notes in a vertical list for triage
 */

"use client";

import { Note } from "@prisma/client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Archive, Trash2 } from "lucide-react";
import NoteCard from "./NoteCard";

interface InboxStreamProps {
  notes: (Note & {
    collection: { id: string; name: string; color?: string | null } | null;
    entities: Array<{ entity: { id: string; name: string; type: string } }>;
  })[];
  quickHints?: {
    projects: string[];
    contexts: string[];
  };
}

export default function InboxStream({ notes, quickHints }: InboxStreamProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

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

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <span className="text-3xl">📥</span>
        </div>
        <p className="text-lg font-medium text-gray-700 mb-1">Inbox is empty</p>
        <p className="text-sm text-gray-500">Start capturing thoughts using the box above.</p>
      </div>
    );
  }

  const allSelected = notes.length > 0 && selected.size === notes.length;
  const someSelected = selected.size > 0;

  return (
    <div className="max-w-3xl">
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
            <button
              onClick={() => bulkPatch({ isArchived: true })}
              disabled={isBulkProcessing}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
        {notes.map((note) => (
          <div key={note.id} className="flex items-start gap-3">
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
