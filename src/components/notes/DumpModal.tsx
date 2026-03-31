"use client";

import { useMemo, useState } from "react";

interface DumpSplitPreview {
  rawContent: string;
  title: string;
  summary: string;
  category: string;
  type: "TASK" | "IDEA" | "NOTE" | "REFERENCE" | "DECISION";
  priority: "high" | "medium" | "low";
  tags: string[];
  suggestedProject: string | null;
  extractedTasks: Array<{
    text: string;
    dueDate?: string | null;
    priority?: "high" | "medium" | "low";
  }>;
  confidenceScore: number;
}

interface EditableDumpSplitPreview extends DumpSplitPreview {
  selected: boolean;
}

interface DumpModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (count: number) => void;
}

/**
 * Organize This Dump modal.
 * Step 1: raw text input + analyze.
 * Step 2: review/edit split previews + confirm create.
 */
export default function DumpModal({ open, onClose, onCreated }: DumpModalProps) {
  const [rawText, setRawText] = useState("");
  const [loadingAnalyze, setLoadingAnalyze] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"input" | "preview">("input");
  const [items, setItems] = useState<EditableDumpSplitPreview[]>([]);

  const selectedCount = useMemo(() => items.filter((item) => item.selected).length, [items]);

  const resetAndClose = () => {
    setRawText("");
    setError(null);
    setLoadingAnalyze(false);
    setCreating(false);
    setStep("input");
    setItems([]);
    onClose();
  };

  /** Analyze raw dump text into organized previews. */
  const handleAnalyze = async () => {
    if (!rawText.trim()) return;

    setLoadingAnalyze(true);
    setError(null);

    try {
      const response = await fetch("/api/notes/analyze-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, maxNotes: 8 }),
      });

      if (!response.ok) {
        throw new Error("Failed to analyze dump");
      }

      const payload = (await response.json()) as {
        splits: DumpSplitPreview[];
      };

      const next = payload.splits.map((item) => ({ ...item, selected: true }));
      setItems(next);
      setStep("preview");
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "Failed to analyze dump");
    } finally {
      setLoadingAnalyze(false);
    }
  };

  /** Create selected reviewed notes from analyzed dump output. */
  const handleCreate = async () => {
    const selected = items.filter((item) => item.selected);
    if (selected.length === 0) {
      setError("Select at least one item to create.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/notes/analyze-dump/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLabel: "organize-dump-modal",
          splits: selected.map((item) => ({
            rawContent: item.rawContent,
            title: item.title,
            summary: item.summary,
            category: item.category,
            type: item.type,
            priority: item.priority,
            tags: item.tags,
            suggestedProject: item.suggestedProject,
            extractedTasks: item.extractedTasks,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create notes");
      }

      const payload = (await response.json()) as { count: number };
      onCreated(payload.count);
      resetAndClose();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create notes");
    } finally {
      setCreating(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Organize This Dump</h2>
          <button
            onClick={resetAndClose}
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {step === "input" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Paste meeting notes, a brain dump, an email thread, or any mixed text. QNote will split and organize it into cards.
              </p>
              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                rows={14}
                placeholder="Paste anything..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          )}

          {step === "preview" && (
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
                      Create this note
                    </label>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                      {item.type} · {item.priority} · {(item.confidenceScore * 100).toFixed(0)}%
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
                    value={item.rawContent}
                    onChange={(event) => {
                      const value = event.target.value;
                      setItems((previous) => previous.map((current, i) => (
                        i === index ? { ...current, rawContent: value } : current
                      )));
                    }}
                    rows={4}
                    className="mb-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="Card content"
                  />

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      value={item.category}
                      onChange={(event) => {
                        const value = event.target.value;
                        setItems((previous) => previous.map((current, i) => (
                          i === index ? { ...current, category: value } : current
                        )));
                      }}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      placeholder="Category"
                    />
                    <input
                      value={item.suggestedProject || ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setItems((previous) => previous.map((current, i) => (
                          i === index ? { ...current, suggestedProject: value || null } : current
                        )));
                      }}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      placeholder="Suggested project"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4">
          <p className="text-sm text-gray-600">
            {step === "input" ? "Paste text and analyze it into cards." : `${selectedCount} of ${items.length} selected`}
          </p>

          <div className="flex items-center gap-2">
            {step === "preview" && (
              <button
                onClick={() => setStep("input")}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                disabled={creating}
              >
                Back
              </button>
            )}

            <button
              onClick={resetAndClose}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              disabled={loadingAnalyze || creating}
            >
              Cancel
            </button>

            {step === "input" ? (
              <button
                onClick={handleAnalyze}
                disabled={loadingAnalyze || !rawText.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingAnalyze ? "Analyzing..." : "Analyze"}
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={creating || selectedCount === 0}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create Selected Notes"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
