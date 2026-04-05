"use client";

import { useState } from "react";

export interface SynthesisSelectableNote {
  id: string;
  title: string | null;
}

interface SynthesisResult {
  title: string;
  summary: string;
  themes: string[];
  actions: string[];
  openQuestions: string[];
  dominantProject: string | null;
  dominantCategory: string | null;
  noteCount: number;
}

interface MultiNoteSynthesisPanelProps {
  notes: SynthesisSelectableNote[];
  title?: string;
  description?: string;
  compact?: boolean;
}

/** Trigger and display a lightweight synthesis across multiple selected notes. */
export default function MultiNoteSynthesisPanel({
  notes,
  title = "Multi-note synthesis",
  description = "Combine selected notes into one synthesis, themes, and next actions.",
  compact = false,
}: MultiNoteSynthesisPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SynthesisResult | null>(null);

  const selectedIds = notes.map((note) => note.id);
  const canSynthesize = selectedIds.length >= 2;

  /** Submit the selected note set to the synthesis endpoint. */
  const runSynthesis = async () => {
    if (!canSynthesize) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteIds: selectedIds }),
      });

      if (!response.ok) {
        throw new Error("Failed to synthesize selected notes");
      }

      setResult((await response.json()) as SynthesisResult);
    } catch (synthesisError) {
      console.error("Error synthesizing notes:", synthesisError);
      setError("Could not synthesize the selected notes.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`rounded-lg border border-gray-200 bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`font-semibold text-gray-900 ${compact ? "text-sm" : "text-base"}`}>{title}</h3>
          <p className={`text-gray-600 ${compact ? "text-[11px]" : "text-xs"}`}>{description}</p>
        </div>
        <button
          type="button"
          onClick={() => void runSynthesis()}
          disabled={isLoading || !canSynthesize}
          className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
        >
          {isLoading ? "Synthesizing..." : canSynthesize ? `Synthesize ${selectedIds.length}` : "Select 2+ notes"}
        </button>
      </div>

      {notes.length > 0 && (
        <p className={`mt-2 text-gray-500 ${compact ? "text-[11px]" : "text-xs"}`}>
          Sources: {notes.slice(0, 4).map((note) => note.title || "Untitled note").join(", ")}{notes.length > 4 ? ` +${notes.length - 4} more` : ""}
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className={`font-semibold text-blue-900 ${compact ? "text-sm" : "text-base"}`}>{result.title}</p>
          <p className={`mt-1 whitespace-pre-wrap text-blue-900 ${compact ? "text-xs" : "text-sm"}`}>{result.summary}</p>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Themes</p>
              <ul className="mt-1 space-y-1 text-xs text-blue-900">
                {result.themes.map((theme) => <li key={theme}>• {theme}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Actions</p>
              <ul className="mt-1 space-y-1 text-xs text-blue-900">
                {result.actions.map((action) => <li key={action}>• {action}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Open Questions</p>
              <ul className="mt-1 space-y-1 text-xs text-blue-900">
                {result.openQuestions.map((question) => <li key={question}>• {question}</li>)}
              </ul>
            </div>
          </div>

          {(result.dominantProject || result.dominantCategory) && (
            <p className="mt-3 text-[11px] text-blue-800">
              {result.dominantProject ? `Project: ${result.dominantProject}` : ""}
              {result.dominantProject && result.dominantCategory ? " · " : ""}
              {result.dominantCategory ? `Category: ${result.dominantCategory}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}