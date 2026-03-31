"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Pencil, Pin, Trash2, X } from "lucide-react";
import SplitNoteModal from "@/components/notes/SplitNoteModal";
import { getConfidenceBadgeConfig } from "@/lib/confidence";

interface RelatedNote {
  id: string;
  title: string | null;
  summary: string | null;
  createdAt: Date;
}

interface NoteDetailData {
  id: string;
  title: string | null;
  rawContent: string;
  summary: string | null;
  category: string | null;
  type: string | null;
  tags: string[];
  status: string;
  isPinned: boolean;
  isArchived: boolean;
  confidenceScore: number | null;
  priority: string | null;
  aiMeta: unknown;
  suggestedProject: string | null;
  extractedTasks: unknown;
  createdAt: Date;
  updatedAt: Date;
  collection: { id: string; name: string; color?: string | null } | null;
  entities: Array<{ entity: { id: string; name: string; type: string } }>;
  relatedNotesFrom: Array<{ score: number; targetNote: RelatedNote }>;
  relatedNotesTo: Array<{ score: number; sourceNote: RelatedNote }>;
}

interface AiMeta {
  intent?: string | null;
  nextAction?: string | null;
  clarificationQuestions?: string[];
}

/** Safely parse aiMeta JSON. */
function parseAiMeta(raw: unknown): AiMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  return {
    intent: typeof obj.intent === "string" ? obj.intent : null,
    nextAction: typeof obj.nextAction === "string" ? obj.nextAction : null,
    clarificationQuestions: Array.isArray(obj.clarificationQuestions)
      ? (obj.clarificationQuestions as string[]).filter((q) => typeof q === "string")
      : [],
  };
}

interface NoteDetailClientProps {
  note: NoteDetailData;
  quickHints?: {
    projects: string[];
    contexts: string[];
  };
}

/**
 * Interactive note detail view — edit, pin, archive, see entities and related notes.
 */
export default function NoteDetailClient({ note, quickHints }: NoteDetailClientProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note.title || "");
  const [editContent, setEditContent] = useState(note.rawContent);
  const [isSaving, setIsSaving] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitMessage, setSplitMessage] = useState<string | null>(null);
  const [isRegeneratingSummary, setIsRegeneratingSummary] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [isApplyingHint, setIsApplyingHint] = useState(false);
  const [displayedSummary, setDisplayedSummary] = useState(note.summary);
  const [displayedConfidence, setDisplayedConfidence] = useState(note.confidenceScore);

  const confidenceBadge = getConfidenceBadgeConfig(displayedConfidence);
  const aiMeta = parseAiMeta(note.aiMeta);
  const hasClarifications = (aiMeta.clarificationQuestions?.length ?? 0) > 0 && (note.confidenceScore ?? 1) < 0.65;

  const extractedTasks = Array.isArray(note.extractedTasks)
    ? (note.extractedTasks as Array<{ text: string; dueDate?: string; priority?: string }>)
    : [];

  const allRelated: Array<{ id: string; title: string | null; summary: string | null; score: number }> = [
    ...note.relatedNotesFrom.map((r) => ({ ...r.targetNote, score: r.score })),
    ...note.relatedNotesTo.map((r) => ({ ...r.sourceNote, score: r.score })),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  /** Save edited title and content. */
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() || null, rawContent: editContent.trim() }),
      });
      if (!res.ok) throw new Error("Save failed");
      setIsEditing(false);
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  /** Toggle pin state. */
  const handlePin = async () => {
    await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: !note.isPinned }),
    });
    router.refresh();
  };

  /** Toggle archive state. */
  const handleArchive = async () => {
    await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: !note.isArchived }),
    });
    router.push("/inbox");
  };

  /** Permanently delete the note. */
  const handleDelete = async () => {
    if (!confirm("Delete this note permanently?")) return;
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    router.push("/inbox");
  };

  /** Handle split completion and refresh the page state. */
  const handleSplitCreated = (count: number) => {
    setSplitMessage(`Created ${count} split card${count === 1 ? "" : "s"}.`);
    router.refresh();
  };

  /**
   * Regenerate summary for the current note and update local display state.
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

      const payload = (await response.json()) as {
        summary: string | null;
        confidenceScore: number | null;
      };

      setDisplayedSummary(payload.summary);
      setDisplayedConfidence(payload.confidenceScore);
      setSummaryMessage("AI summary regenerated.");
      router.refresh();
    } catch (error) {
      console.error("Error regenerating summary:", error);
      setSummaryMessage("Could not regenerate summary. Please try again.");
    } finally {
      setIsRegeneratingSummary(false);
    }
  };

  /**
   * Apply a clarification hint and regenerate note insights.
   */
  const handleApplyHint = async (kind: "project" | "context", value: string) => {
    setIsApplyingHint(true);
    setSummaryMessage(null);

    try {
      const response = await fetch(`/api/notes/${note.id}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectHint: kind === "project" ? value : undefined,
          contextHint: kind === "context" ? value : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to apply hint");
      }

      const payload = (await response.json()) as {
        summary: string | null;
        confidenceScore: number | null;
      };

      setDisplayedSummary(payload.summary);
      setDisplayedConfidence(payload.confidenceScore);
      setSummaryMessage(`Applied ${kind} hint: ${value}`);
      router.refresh();
    } catch (error) {
      console.error("Error applying hint:", error);
      setSummaryMessage("Could not apply clarification hint.");
    } finally {
      setIsApplyingHint(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Main content */}
      <div className="lg:col-span-2 space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          {splitMessage && (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {splitMessage}
            </div>
          )}

          {summaryMessage && (
            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              {summaryMessage}
            </div>
          )}

          {/* Header bar */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-full rounded border border-blue-300 px-2 py-1 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="flex items-start gap-2 flex-wrap">
                  {note.priority === "high" && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 shrink-0">
                      High priority
                    </span>
                  )}
                  {note.priority === "medium" && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 shrink-0">
                      Medium priority
                    </span>
                  )}
                  <h1 className="text-2xl font-bold text-gray-900">
                    {note.title || "Untitled note"}
                  </h1>
                </div>
              )}
              <p className="mt-1 text-sm text-gray-500">
                {new Date(note.createdAt).toLocaleString()}
                {note.updatedAt.getTime() !== note.createdAt.getTime() &&
                  ` · Updated ${new Date(note.updatedAt).toLocaleDateString()}`}
              </p>
            </div>

            <div className="flex shrink-0 gap-1">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded-lg p-2 hover:bg-green-100 hover:text-green-700 disabled:opacity-50"
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => { setIsEditing(false); setEditTitle(note.title || ""); setEditContent(note.rawContent); }}
                    className="rounded-lg p-2 hover:bg-gray-100"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setIsEditing(true)} className="rounded-lg p-2 hover:bg-gray-100" title="Edit"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setIsSplitModalOpen(true)} className="rounded-lg p-2 hover:bg-gray-100" title="Split note">
                    <span className="text-xs font-semibold text-gray-700">Split</span>
                  </button>
                  <button onClick={handlePin} className="rounded-lg p-2 hover:bg-gray-100" title={note.isPinned ? "Unpin" : "Pin"}><Pin className={`h-4 w-4 ${note.isPinned ? "fill-current text-blue-600" : ""}`} /></button>
                  <button onClick={handleArchive} className="rounded-lg p-2 hover:bg-gray-100" title={note.isArchived ? "Restore" : "Archive"}><Archive className="h-4 w-4" /></button>
                  <button onClick={handleDelete} className="rounded-lg p-2 hover:bg-red-100 hover:text-red-700" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </div>
          </div>

          {/* Content area */}
          {isEditing ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={12}
              className="w-full resize-y rounded border border-blue-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <p className="whitespace-pre-wrap text-gray-900">{note.rawContent}</p>
          )}

          {/* Metadata chips */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {note.collection && (
              <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">{note.collection.name}</span>
            )}
            {note.category && (
              <span className="rounded-full bg-purple-100 px-2 py-1 text-purple-700">{note.category}</span>
            )}
            {note.type && (
              <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">{note.type}</span>
            )}
            {note.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-gray-200 px-2 py-1 text-gray-700">#{tag}</span>
            ))}
          </div>
        </div>

        {/* AI Summary */}
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-blue-900">AI Summary</h2>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${confidenceBadge.className}`}>
                {confidenceBadge.label}
              </span>
              <button
                onClick={handleRegenerateSummary}
                disabled={isRegeneratingSummary}
                className="rounded-md border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
              >
                {isRegeneratingSummary ? "Regenerating..." : "Regenerate"}
              </button>
            </div>
          </div>

          <p className="text-sm text-blue-800">
            {displayedSummary || "No summary yet. Use Regenerate to create one."}
          </p>

          {note.suggestedProject && (
            <p className="mt-2 text-xs text-blue-700">Suggested project: <strong>{note.suggestedProject}</strong></p>
          )}
        </div>

        {/* Intent + Next Action */}
        {(aiMeta.intent || aiMeta.nextAction) && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 space-y-2">
            {aiMeta.intent && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500 mb-0.5">Intent</p>
                <p className="text-sm text-indigo-900">{aiMeta.intent}</p>
              </div>
            )}
            {aiMeta.nextAction && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500 mb-0.5">Next Action</p>
                <p className="text-sm font-medium text-indigo-900">➜ {aiMeta.nextAction}</p>
              </div>
            )}
          </div>
        )}

        {/* Clarification questions */}
        {hasClarifications && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 text-xs font-semibold text-amber-800">AI has questions about this note:</p>
            <ul className="space-y-1">
              {aiMeta.clarificationQuestions!.map((q, i) => (
                <li key={i} className="text-sm text-amber-900">• {q}</li>
              ))}
            </ul>
            {quickHints?.projects && quickHints.projects.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-amber-800 mb-1">Quick project hints</p>
                <div className="flex flex-wrap gap-1">
                  {quickHints.projects.map((project) => (
                    <button
                      key={`detail-project-${project}`}
                      type="button"
                      disabled={isApplyingHint}
                      onClick={() => handleApplyHint("project", project)}
                      className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {project}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {quickHints?.contexts && quickHints.contexts.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] font-semibold text-amber-800 mb-1">Quick context hints</p>
                <div className="flex flex-wrap gap-1">
                  {quickHints.contexts.map((context) => (
                    <button
                      key={`detail-context-${context}`}
                      type="button"
                      disabled={isApplyingHint}
                      onClick={() => handleApplyHint("context", context)}
                      className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    >
                      {context}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-2 text-[11px] text-amber-700">Add project/context hints to the capture bar and regenerate, or edit the note to clarify.</p>
          </div>
        )}

        {/* Extracted tasks */}
        {extractedTasks.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Extracted Tasks</h2>
            <ul className="space-y-2">
              {extractedTasks.map((task, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-800">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-gray-400" />
                  <span className="flex-1">
                    {task.text}
                    {task.dueDate && <span className="ml-2 text-xs text-blue-600">Due: {task.dueDate}</span>}
                  </span>
                  {task.priority === "high" && (
                    <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">High</span>
                  )}
                  {task.priority === "medium" && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Med</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Entities */}
        {note.entities.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Entities</h2>
            <ul className="space-y-1">
              {note.entities.map(({ entity }) => (
                <li key={entity.id} className="flex items-center gap-2 text-xs">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 uppercase">{entity.type}</span>
                  <span className="text-gray-800">{entity.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Related notes */}
        {allRelated.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Related Notes</h2>
            <ul className="space-y-2">
              {allRelated.map((related) => (
                <li key={related.id}>
                  <a href={`/notes/${related.id}`} className="block rounded border border-gray-100 p-2 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                    <div className="text-xs font-medium text-gray-900 line-clamp-1">{related.title || "Untitled note"}</div>
                    {related.summary && <div className="mt-0.5 text-[11px] text-gray-600 line-clamp-2">{related.summary}</div>}
                    <div className="mt-1 text-[11px] text-blue-600">Similarity: {(related.score * 100).toFixed(0)}%</div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Details panel */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs space-y-2 text-gray-700">
          <h2 className="font-semibold text-sm text-gray-900 mb-2">Details</h2>
          <div className="flex justify-between"><span>Status</span><span className="font-medium">{note.status}</span></div>
          {displayedConfidence !== null && (
            <div className="flex justify-between"><span>AI Confidence</span><span className="font-medium">{((displayedConfidence ?? 0) * 100).toFixed(0)}%</span></div>
          )}
          <div className="flex justify-between"><span>Pinned</span><span className="font-medium">{note.isPinned ? "Yes" : "No"}</span></div>
          <div className="flex justify-between"><span>Archived</span><span className="font-medium">{note.isArchived ? "Yes" : "No"}</span></div>
        </div>
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
