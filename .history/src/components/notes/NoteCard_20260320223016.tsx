/**
 * NoteCard - displays a single note in a card format
 */

"use client";

import { Note } from "@prisma/client";
import { Archive, Pin, Trash2, Edit } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface NoteCardProps {
  note: Note & {
    collection: { id: string; name: string; color?: string | null } | null;
    entities: Array<{ entity: { id: string; name: string; type: string } }>;
  };
}

export default function NoteCard({ note }: NoteCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  /**
   * Handle archiving a note
   */
  const handleArchive = async () => {
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: !note.isArchived }),
      });

      if (!response.ok) throw new Error("Failed to archive note");
      router.refresh();
    } catch (error) {
      console.error("Error archiving note:", error);
    }
  };

  /**
   * Handle pinning a note
   */
  const handlePin = async () => {
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !note.isPinned }),
      });

      if (!response.ok) throw new Error("Failed to pin note");
      router.refresh();
    } catch (error) {
      console.error("Error pinning note:", error);
    }
  };

  /**
   * Handle deleting a note
   */
  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this note?")) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete note");
      router.refresh();
    } catch (error) {
      console.error("Error deleting note:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`border rounded-lg p-4 transition-all ${
      note.isPinned ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {note.title && (
            <h3 className="font-semibold text-lg mb-1">{note.title}</h3>
          )}
          <p className="text-sm text-gray-500">
            {new Date(note.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 ml-4">
          <button
            onClick={handlePin}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            title={note.isPinned ? "Unpin" : "Pin"}
          >
            <Pin className={`w-4 h-4 ${note.isPinned ? "fill-current" : ""}`} />
          </button>

          <button
            onClick={handleArchive}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            title={note.isArchived ? "Restore" : "Archive"}
          >
            <Archive className="w-4 h-4" />
          </button>

          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors disabled:opacity-50"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-900 mb-3 whitespace-pre-wrap line-clamp-4">
        {note.rawContent}
      </p>

      {/* Metadata */}
      <div className="flex flex-wrap gap-2 items-center text-xs">
        {note.collection && (
          <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700">
            {note.collection.name}
          </span>
        )}

        {note.category && (
          <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700">
            {note.category}
          </span>
        )}

        {note.tags && note.tags.length > 0 && (
          <div className="flex gap-1">
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 rounded-full bg-gray-200 text-gray-700"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {note.status === "PROCESSING" && (
          <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
            AI organizing...
          </span>
        )}
      </div>
    </div>
  );
}
