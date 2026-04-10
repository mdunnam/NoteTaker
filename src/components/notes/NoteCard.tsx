/**
 * NoteCard - displays a single note in a card format
 */

"use client";

import { Archive, Check, MoreHorizontal, Pencil, Pin, Trash2, X } from "lucide-react";
import Link from "next/link";
import { parseNoteAiMeta } from "@/lib/clarification";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ClarificationLoop from "@/components/notes/ClarificationLoop";
import SplitNoteModal from "@/components/notes/SplitNoteModal";
import { getConfidenceBadgeConfig } from "@/lib/confidence";

export interface NoteData {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: Date;
  updatedAt: Date;
  isPinned: boolean;
  isArchived: boolean;
  category: string | null;
  type: string | null;
  tags: string[];
  status: string;
  confidenceScore: number | null;
  priority: string | null;
  suggestedProject: string | null;
  extractedTasks: unknown;
  aiMeta: unknown;
  collection: { id: string; name: string; color?: string | null } | null;
  entities: Array<{ entity: { id: string; name: string; type: string } }>;
}

interface NoteCardProps {
  note: NoteData;
  quickHints?: {
    projects: string[];
    contexts: string[];
  };
}

interface CollectionOption {
  id: string;
  name: string;
}

export default function NoteCard({ note, quickHints }: NoteCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title || "");
  const [editContent, setEditContent] = useState(note.rawContent);
  const [editCollectionId, setEditCollectionId] = useState(note.collection?.id || "");
  const [isSaving, setIsSaving] = useState(false);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitMessage, setSplitMessage] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const confidenceBadge = getConfidenceBadgeConfig(note.confidenceScore);
  const aiMeta = parseNoteAiMeta(note.aiMeta);
  const hasClarifications = (aiMeta.clarificationQuestions?.length ?? 0) > 0 && (note.confidenceScore ?? 1) < 0.65;

  useEffect(() => {
    const loadCollections = async () => {
      try {
        const response = await fetch("/api/collections");
        if (!response.ok) return;
        const data = (await response.json()) as Array<{ id: string; name: string }>;
        setCollections(data.map((c) => ({ id: c.id, name: c.name })));
      } catch (error) {
        console.error("Error loading collections:", error);
      }
    };

    loadCollections();
  }, []);

  /**
   * Save inline edits back to the server.
   */
  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim() || null,
          rawContent: editContent.trim(),
          collectionId: editCollectionId || null,
        }),
      });
      if (!response.ok) throw new Error("Save failed");
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      console.error("Error saving note edit:", error);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Cancel inline editing and restore original values.
   */
  const handleCancelEdit = () => {
    setEditTitle(note.title || "");
    setEditContent(note.rawContent);
    setEditCollectionId(note.collection?.id || "");
    setIsEditing(false);
  };

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

  /**
   * Handle split completion and refresh card list.
   */
  const handleSplitCreated = (count: number) => {
    setSplitMessage(`Created ${count} split card${count === 1 ? "" : "s"}.`);
    router.refresh();
  };

  /**
   * Regenerate AI summary for this note directly from inbox triage.
   */
  const handleRegenerateSummary = async () => {
    setIsRegeneratingSummary(true);
    setSummaryMessage(null);

    try {
      const response = await fetch(`/api/notes/${note.id}/summary`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to regenerate summary");
      }

      setSummaryMessage("Summary regenerated.");
      router.refresh();
    } catch (error) {
      console.error("Error regenerating summary:", error);
      setSummaryMessage("Could not regenerate summary.");
    } finally {
      setIsRegeneratingSummary(false);
    }
  };

  return (
    <div className={`relative border rounded-xl p-4 transition-all ${note.isPinned ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
      {splitMessage && (
        <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          {splitMessage}
        </div>
      )}

      {summaryMessage && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {summaryMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {note.priority === "high" && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">High</span>
            )}
            {note.priority === "medium" && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Medium</span>
            )}
            {note.title && (
              <a href={`/notes/${note.id}`} className="font-semibold text-base text-gray-900 hover:text-blue-600 hover:underline truncate">
                {note.title}
              </a>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 ml-4 relative">
          {isEditing ? (
            <>
              <button onClick={handleSaveEdit} disabled={isSaving} className="p-2 rounded-lg hover:bg-green-100 hover:text-green-700 transition-colors disabled:opacity-50" title="Save">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={handleCancelEdit} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Cancel">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen((prev) => !prev)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="More actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-gray-200 bg-white shadow-lg py-1">
                    <button onClick={() => { handlePin(); setDropdownOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                      <Pin className={`w-4 h-4 ${note.isPinned ? "fill-current text-blue-600" : ""}`} />
                      {note.isPinned ? "Unpin" : "Pin"}
                    </button>
                    <button onClick={() => { setIsSplitModalOpen(true); setDropdownOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                      <span className="w-4 h-4 text-center text-[11px] font-bold">✂</span> Split
                    </button>
                    <button onClick={() => { handleRegenerateSummary(); setDropdownOpen(false); }} disabled={isRegeneratingSummary} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50">
                      <span className="w-4 h-4 text-center text-[11px]">↻</span> Regen summary
                    </button>
                    <button onClick={() => { handleArchive(); setDropdownOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                      <Archive className="w-4 h-4" /> {note.isArchived ? "Restore" : "Archive"}
                    </button>
                    <button onClick={() => { setDropdownOpen(false); handleDelete(); }} disabled={isDeleting} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Title edit */}
      {isEditing && (
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Title (optional)"
          className="mb-2 w-full rounded border border-blue-300 px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      {/* Content */}
      {isEditing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={5}
          className="mb-3 w-full resize-y rounded border border-blue-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <p className="text-sm text-gray-900 mb-2 whitespace-pre-wrap line-clamp-4">
          {note.rawContent}
        </p>
      )}

      {!isEditing && note.summary && (
        <div className="mb-3 rounded-md border-l-4 border-blue-400 bg-blue-50 pl-3 pr-2.5 py-2 text-xs text-blue-900">
          {note.summary}
        </div>
      )}

      {/* AI Intent callout */}
      {!isEditing && aiMeta.intent && (
        <p className="mb-3 text-xs text-indigo-700 bg-indigo-50 rounded-md px-2.5 py-1.5 border border-indigo-100">
          <span className="font-semibold">Intent:</span> {aiMeta.intent}
        </p>
      )}

      {/* Clarification questions for low-confidence notes */}
      {!isEditing && hasClarifications && (
        <div className="mb-3">
          <ClarificationLoop
            noteId={note.id}
            aiMeta={note.aiMeta}
            quickHints={quickHints}
            compact
            onUpdated={(_, nextMessage) => setSummaryMessage(nextMessage)}
          />
        </div>
      )}

      {isEditing && (
        <select
          value={editCollectionId}
          onChange={(e) => setEditCollectionId(e.target.value)}
          className="mb-3 w-full rounded border border-blue-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">No collection</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      )}

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

        {note.suggestedProject && (
          <span className="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
            {note.suggestedProject}
          </span>
        )}

        {note.tags && note.tags.length > 0 && (
          <div className="flex gap-1">
            {note.tags.map((tag: string) => (
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

        {note.status === "PROCESSED" && (
          confidenceBadge.label === "Needs review" ? (
            <Link href="/review" className={`px-2 py-1 rounded-full text-[11px] font-medium ${confidenceBadge.className} hover:opacity-80 hover:underline underline-offset-2`}>
              {confidenceBadge.label} →
            </Link>
          ) : (
            <span className={`px-2 py-1 rounded-full ${confidenceBadge.className}`}>
              {confidenceBadge.label}
            </span>
          )
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <a href={`/notes/${note.id}`} className="text-xs text-blue-600 hover:underline font-medium">
          Open note →
        </a>
      </div>

      <SplitNoteModal
        noteId={note.id}
        open={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        onCreated={handleSplitCreated}
      />
    </div>
  );
}
