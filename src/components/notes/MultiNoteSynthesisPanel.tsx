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
  plan: {
    objective: string;
    firstMove: string;
    steps: Array<{
      title: string;
      detail: string;
      horizon: "now" | "next" | "later";
    }>;
    risks: string[];
    successSignal: string;
  };
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
  const [planningGoal, setPlanningGoal] = useState("");

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
        body: JSON.stringify({
          noteIds: selectedIds,
          ...(planningGoal.trim() ? { planningGoal: planningGoal.trim() } : {}),
        }),
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

      <input
        type="text"
        value={planningGoal}
        onChange={(event) => setPlanningGoal(event.target.value)}
        placeholder="Optional planning lens: ship this week, prep client meeting, unblock launch..."
        className={`mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 ${compact ? "text-xs" : "text-sm"}`}
      />

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

          <div className="mt-4 rounded-lg border border-blue-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Plan</p>
            <p className={`mt-1 font-medium text-gray-900 ${compact ? "text-xs" : "text-sm"}`}>{result.plan.objective}</p>
            <p className={`mt-2 text-gray-700 ${compact ? "text-[11px]" : "text-xs"}`}>
              <span className="font-semibold text-gray-900">First move:</span> {result.plan.firstMove}
            </p>

            <ol className="mt-3 space-y-2">
              {result.plan.steps.slice(0, compact ? 3 : result.plan.steps.length).map((step, index) => (
                <li key={`${step.title}-${index}`} className="rounded border border-gray-200 bg-gray-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-medium text-gray-900 ${compact ? "text-xs" : "text-sm"}`}>{step.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${step.horizon === "now" ? "bg-green-100 text-green-700" : step.horizon === "next" ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-700"}`}>
                      {step.horizon}
                    </span>
                  </div>
                  <p className={`mt-1 text-gray-700 ${compact ? "text-[11px]" : "text-xs"}`}>{step.detail}</p>
                </li>
              ))}
            </ol>

            {result.plan.risks.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Risks</p>
                <ul className="mt-1 space-y-1 text-xs text-gray-700">
                  {result.plan.risks.slice(0, compact ? 2 : result.plan.risks.length).map((risk) => <li key={risk}>• {risk}</li>)}
                </ul>
              </div>
            )}

            <p className={`mt-3 text-gray-700 ${compact ? "text-[11px]" : "text-xs"}`}>
              <span className="font-semibold text-gray-900">Success signal:</span> {result.plan.successSignal}
            </p>
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