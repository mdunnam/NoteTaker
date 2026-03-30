"use client";

import { useEffect, useMemo, useState } from "react";

interface SplitCandidate {
  content: string;
  category: string;
  type: "TASK" | "IDEA" | "NOTE" | "REFERENCE" | "DECISION";
  title: string;
}

interface EditableSplitCandidate extends SplitCandidate {
  selected: boolean;
}

interface SplitNoteModalProps {
  noteId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (count: number) => void;
}

/**
 * Modal for reviewing AI split suggestions and creating selected cards.
 */
export default function SplitNoteModal({ noteId, open, onClose, onCreated }: SplitNoteModalProps) {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<EditableSplitCandidate[]>([]);

  const selectedCount = useMemo(
    () => items.filter((item) => item.selected).length,
    [items]
  );

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    const loadPreview = async () => {
      setLoadingPreview(true);
      setError(null);
      try {
        const response = await fetch(`/api/notes/${noteId}/split`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "preview", maxNotes: 8 }),
        });

        if (!response.ok) {
          throw new Error("Failed to load split suggestions");
        }

        const payload = (await response.json()) as { needsSplit: boolean; notes: SplitCandidate[] };
        const nextItems = payload.notes.map((note) => ({ ...note, selected: true }));

        if (isMounted) {
          if (!payload.needsSplit || nextItems.length <= 1) {
            setError("This note does not appear to contain multiple distinct items.");
            setItems([]);
          } else {
            setItems(nextItems);
          }
        }
      } catch (previewError) {
        if (isMounted) {
          setError(previewError instanceof Error ? previewError.message : "Failed to preview split");
          setItems([]);
        }
      } finally {
        if (isMounted) {
          setLoadingPreview(false);
        }
      }
    };

    void loadPreview();

    return () => {
      isMounted = false;
    };
  }, [noteId, open]);

  /**
   * Create selected split notes and enqueue enrichment.
   */
  const handleCreate = async () => {
    const selected = items.filter((item) => item.selected);
    if (selected.length === 0) {
      setError("Select at least one split card to create.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/notes/${noteId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          selectedNotes: selected.map((item) => ({
            content: item.content,
            title: item.title,
            category: item.category,
            type: item.type,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create split notes");
      }

      const payload = (await response.json()) as { count: number };
      onCreated(payload.count);
      onClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create split notes");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Split Into Multiple Cards</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Close
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          {loadingPreview && <p className="text-sm text-gray-600">Analyzing note and generating split suggestions...</p>}

          {!loadingPreview && error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {error}
            </div>
          )}

          {!loadingPreview && !error && items.length > 0 && (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={`${index}-${item.title}`} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setItems((previous) => previous.map((current, i) => (
                            i === index ? { ...current, selected: checked } : current
                          )));
                        }}
                      />
                      Create this card
                    </label>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                      {item.type} · {item.category || "General"}
                    </span>
                  </div>

                  <input
                    value={item.title}
                    onChange={(event) => {
                      const value = event.target.value;
                      setItems((previous) => previous.map((current, i) => (
                        i === index ? { ...current, title: value } : current
                      )));
                    }}
                    className="mb-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="Card title"
                  />

                  <textarea
                    value={item.content}
                    onChange={(event) => {
                      const value = event.target.value;
                      setItems((previous) => previous.map((current, i) => (
                        i === index ? { ...current, content: value } : current
                      )));
                    }}
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="Card content"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <p className="text-sm text-gray-600">
            {selectedCount} of {items.length} selected
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || loadingPreview || selectedCount === 0 || items.length === 0}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create Selected Cards"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
