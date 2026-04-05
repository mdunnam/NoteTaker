"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface ExternalCaptureClientProps {
  initialContent: string;
}

/**
 * Focused capture form used by the browser bookmarklet and other external entry points.
 */
export default function ExternalCaptureClient({ initialContent }: ExternalCaptureClientProps) {
  const [content, setContent] = useState(initialContent);
  const [projectHint, setProjectHint] = useState("");
  const [contextHint, setContextHint] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Save one externally captured note using the existing notes API. */
  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!content.trim()) {
      return;
    }

    setIsSaving(true);
    setMessage("");
    setSavedNoteId(null);

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawContent: content,
          projectHint: projectHint.trim() || undefined,
          contextHint: contextHint.trim() || undefined,
          autoSplit: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create note");
      }

      const payload = (await response.json()) as { note?: { id: string } };
      setMessage("Clip saved and queued for organization.");
      setSavedNoteId(payload.note?.id || null);
      setContent("");
      setProjectHint("");
      setContextHint("");
      textareaRef.current?.focus();
    } catch (error) {
      console.error("Error saving external capture:", error);
      setMessage("Could not save clip. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold text-gray-900">Capture From Anywhere</h1>
        <p className="mt-2 text-sm text-gray-600">
          This page is the landing zone for bookmarklet clips and quick captures from outside QNote. It works best for short selections, page titles, URLs, and quick thoughts.
        </p>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <label htmlFor="external-capture-content" className="mb-2 block text-sm font-medium text-gray-700">
              Captured text
            </label>
            <textarea
              id="external-capture-content"
              ref={textareaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Paste or capture text here..."
              rows={10}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="external-capture-project" className="mb-2 block text-sm font-medium text-gray-700">
                Project hint
              </label>
              <input
                id="external-capture-project"
                type="text"
                value={projectHint}
                onChange={(event) => setProjectHint(event.target.value)}
                placeholder="Optional: QNote, Client A, Launch"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="external-capture-context" className="mb-2 block text-sm font-medium text-gray-700">
                Context hint
              </label>
              <input
                id="external-capture-context"
                type="text"
                value={contextHint}
                onChange={(event) => setContextHint(event.target.value)}
                placeholder="Optional: article research, client call, backlog cleanup"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSaving || !content.trim()}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Clip"}
            </button>
            <Link href="/settings" className="text-sm font-medium text-blue-700 hover:underline">
              Back to Settings
            </Link>
            <Link href="/inbox" className="text-sm font-medium text-gray-700 hover:underline">
              Open Inbox
            </Link>
          </div>

          {message && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${savedNoteId ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
              <p>{message}</p>
              {savedNoteId && (
                <Link href={`/notes/${savedNoteId}`} className="mt-1 inline-block font-medium text-green-900 hover:underline">
                  Open saved note
                </Link>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}