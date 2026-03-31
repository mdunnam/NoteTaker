"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

interface InsightNote {
  id: string;
  title: string | null;
  summary: string | null;
  score: number;
}

interface InsightsPayload {
  noteId: string;
  aiMeta: {
    intent?: string | null;
    nextAction?: string | null;
    clarificationQuestions?: string[];
  } | null;
  extractedTasks: unknown;
  related: InsightNote[];
}

/**
 * Contextual right-panel section that appears on note-detail routes.
 */
export default function RightPanelContextual() {
  const pathname = usePathname();
  const [insights, setInsights] = useState<InsightsPayload | null>(null);

  const noteId = useMemo(() => {
    const match = pathname?.match(/^\/notes\/([^/]+)$/);
    return match?.[1] || null;
  }, [pathname]);

  useEffect(() => {
    if (!noteId) {
      setInsights(null);
      return;
    }

    let isMounted = true;

    const loadInsights = async () => {
      try {
        const response = await fetch(`/api/notes/${noteId}/insights`);
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as InsightsPayload;
        if (isMounted) {
          setInsights(payload);
        }
      } catch (error) {
        console.error("Error loading contextual insights:", error);
      }
    };

    void loadInsights();

    return () => {
      isMounted = false;
    };
  }, [noteId]);

  if (!noteId || !insights) {
    return null;
  }

  const extractedTasks = Array.isArray(insights.extractedTasks)
    ? (insights.extractedTasks as Array<{ text?: string }>).filter((task) => !!task?.text)
    : [];

  const clarificationQuestions = Array.isArray(insights.aiMeta?.clarificationQuestions)
    ? insights.aiMeta?.clarificationQuestions || []
    : [];

  return (
    <div className="pt-6 border-t border-gray-200 space-y-4">
      <h3 className="font-semibold text-sm">Current Note Context</h3>

      {insights.aiMeta?.intent && (
        <div className="rounded border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-indigo-600">Intent</p>
          <p className="text-xs text-indigo-900 mt-1">{insights.aiMeta.intent}</p>
        </div>
      )}

      {insights.aiMeta?.nextAction && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-blue-600">Next Action</p>
          <p className="text-xs text-blue-900 mt-1">{insights.aiMeta.nextAction}</p>
        </div>
      )}

      {clarificationQuestions.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">Needs Clarification</p>
          <ul className="mt-1 space-y-1">
            {clarificationQuestions.slice(0, 2).map((question) => (
              <li key={question} className="text-xs text-amber-900">• {question}</li>
            ))}
          </ul>
        </div>
      )}

      {extractedTasks.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Top Tasks</p>
          <ul className="space-y-1">
            {extractedTasks.slice(0, 3).map((task, index) => (
              <li key={`${task.text}-${index}`} className="text-xs text-gray-800">• {task.text}</li>
            ))}
          </ul>
        </div>
      )}

      {insights.related.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Related (Contextual)</p>
          <ul className="space-y-2">
            {insights.related.slice(0, 3).map((related) => (
              <li key={related.id}>
                <a href={`/notes/${related.id}`} className="block rounded border border-gray-200 bg-white p-2 hover:border-blue-300">
                  <div className="text-xs font-medium text-gray-900 line-clamp-1">{related.title || "Untitled note"}</div>
                  <div className="mt-1 text-[11px] text-blue-700">{Math.round(related.score * 100)}% match</div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
