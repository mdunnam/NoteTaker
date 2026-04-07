"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import MultiNoteSynthesisPanel from "@/components/notes/MultiNoteSynthesisPanel";

interface ClusterNotePreview {
  id: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  suggestedProject: string | null;
  createdAt: string;
}

interface KnowledgeCluster {
  id: string;
  kind: "project" | "topic";
  label: string;
  noteCount: number;
  dominantCategory: string | null;
  crossReferences: string[];
  notes: ClusterNotePreview[];
}

interface ReorganizationSuggestion {
  suggestedProject: string | null;
  suggestedCategory: string | null;
  reason: string;
  confidence: number;
  basedOnTopics: string[];
  supportingNotes: ClusterNotePreview[];
}

interface InsightNote {
  id: string;
  title: string | null;
  summary: string | null;
  score: number;
}

interface UnresolvedThread {
  label: string;
  kind: "project" | "topic";
  mentionCount: number;
  notes: ClusterNotePreview[];
}

interface SuggestedLink {
  id: string;
  title: string | null;
  summary: string | null;
  score: number;
  reason: string;
}

interface InsightsPayload {
  noteId: string;
  note: {
    id: string;
    title: string | null;
    summary: string | null;
    category: string | null;
    suggestedProject: string | null;
    confidenceScore: number | null;
    priority: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  aiMeta: {
    intent?: string | null;
    nextAction?: string | null;
    clarificationQuestions?: string[];
  } | null;
  extractedTasks: unknown;
  related: InsightNote[];
  clusters: KnowledgeCluster[];
  reorganizationSuggestion: ReorganizationSuggestion | null;
  unresolvedThread: UnresolvedThread | null;
  suggestedLinks: SuggestedLink[];
}

/**
 * Contextual right-panel section that appears on note-detail routes.
 */
export default function RightPanelContextual() {
  const pathname = usePathname();
  const router = useRouter();
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [acceptingLinkId, setAcceptingLinkId] = useState<string | null>(null);

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
  }, [noteId, reloadToken]);

  if (!noteId || !insights) {
    return null;
  }

  /** Apply a suggested project/category context and regenerate the note. */
  const handleApplySuggestion = async () => {
    if (!noteId || !insights.reorganizationSuggestion) {
      return;
    }

    setIsApplyingSuggestion(true);
    setSuggestionMessage(null);

    try {
      const suggestion = insights.reorganizationSuggestion;

      await fetch(`/api/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(suggestion.suggestedProject ? { suggestedProject: suggestion.suggestedProject } : {}),
          ...(suggestion.suggestedCategory ? { category: suggestion.suggestedCategory } : {}),
        }),
      });

      const summaryResponse = await fetch(`/api/notes/${noteId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectHint: suggestion.suggestedProject || undefined,
          contextHint: suggestion.suggestedCategory || undefined,
        }),
      });

      if (!summaryResponse.ok) {
        throw new Error("Failed to re-organize note with cluster context");
      }

      setSuggestionMessage("Applied inferred cluster context and regenerated the note.");
      setReloadToken((current) => current + 1);
      router.refresh();
    } catch (error) {
      console.error("Error applying cluster suggestion:", error);
      setSuggestionMessage("Could not apply the inferred cluster context.");
    } finally {
      setIsApplyingSuggestion(false);
    }
  };

  /** Accept one suggested semantic note link and persist the relation. */
  const handleAcceptSuggestedLink = async (candidate: SuggestedLink) => {
    if (!noteId) {
      return;
    }

    setAcceptingLinkId(candidate.id);
    setSuggestionMessage(null);

    try {
      const response = await fetch(`/api/notes/${noteId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetNoteId: candidate.id,
          score: candidate.score,
          reason: "Accepted from suggested links",
        }),
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error || "Failed to accept suggested link");
      }

      setSuggestionMessage(`Linked ${candidate.title || "Untitled note"} to this note.`);
      setReloadToken((current) => current + 1);
      router.refresh();
    } catch (error) {
      console.error("Error accepting suggested link:", error);
      setSuggestionMessage("Could not save this suggested link.");
    } finally {
      setAcceptingLinkId((current) => current === candidate.id ? null : current);
    }
  };

  const extractedTasks = Array.isArray(insights.extractedTasks)
    ? (insights.extractedTasks as Array<{ text?: string }>).filter((task) => !!task?.text)
    : [];

  const clarificationQuestions = Array.isArray(insights.aiMeta?.clarificationQuestions)
    ? insights.aiMeta?.clarificationQuestions || []
    : [];

  return (
    <div className="pt-6 border-t border-gray-200 space-y-4">
      <h3 className="font-semibold text-sm">Current Note Context</h3>

      {suggestionMessage && (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-xs text-green-800">
          {suggestionMessage}
        </div>
      )}

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

      {insights.unresolvedThread && (
        <div className="rounded border border-orange-200 bg-orange-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-orange-700">Unresolved Thread</p>
          <p className="mt-1 text-xs text-orange-900">
            You&apos;ve mentioned <strong>{insights.unresolvedThread.label}</strong> {insights.unresolvedThread.mentionCount} times without a clear wrap-up.
          </p>
          <ul className="mt-2 space-y-1">
            {insights.unresolvedThread.notes.map((threadNote) => (
              <li key={threadNote.id}>
                <Link href={`/notes/${threadNote.id}`} className="text-[11px] text-orange-800 hover:underline">
                  {threadNote.title || "Untitled note"}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <MultiNoteSynthesisPanel
              notes={[
                { id: insights.note.id, title: insights.note.title },
                ...insights.unresolvedThread.notes.map((note) => ({ id: note.id, title: note.title })),
              ]}
              title="Synthesize this thread"
              description="Turn the repeated thread into one brief and next-step plan."
              compact
              planningGoalPlaceholder={`Optional planning lens: resolve ${insights.unresolvedThread.label}, decide next step, stop circling this thread...`}
            />
          </div>
        </div>
      )}

      <MultiNoteSynthesisPanel
        notes={[
          { id: insights.note.id, title: insights.note.title },
          ...insights.related.map((related) => ({ id: related.id, title: related.title })),
          ...insights.clusters.flatMap((cluster) => cluster.notes.map((note) => ({ id: note.id, title: note.title }))),
        ].filter((value, index, array) => array.findIndex((item) => item.id === value.id) === index)}
        title="Synthesize context"
        description="Blend this note with its related context and cluster evidence."
        compact
      />

      {insights.suggestedLinks.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Suggested Links</p>
          <ul className="space-y-2">
            {insights.suggestedLinks.map((candidate) => (
              <li key={candidate.id} className="rounded border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/notes/${candidate.id}`} className="text-xs font-medium text-gray-900 hover:underline">
                      {candidate.title || "Untitled note"}
                    </Link>
                    {candidate.summary && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-gray-600">{candidate.summary}</p>
                    )}
                    <p className="mt-2 text-[11px] text-gray-700">{candidate.reason}</p>
                    <p className="mt-1 text-[11px] text-blue-700">{Math.round(candidate.score * 100)}% semantic overlap</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleAcceptSuggestedLink(candidate)}
                    disabled={acceptingLinkId === candidate.id || isApplyingSuggestion}
                    className="shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                  >
                    {acceptingLinkId === candidate.id ? "Linking..." : "Accept link"}
                  </button>
                </div>
              </li>
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
                <Link href={`/notes/${related.id}`} className="block rounded border border-gray-200 bg-white p-2 hover:border-blue-300">
                  <div className="text-xs font-medium text-gray-900 line-clamp-1">{related.title || "Untitled note"}</div>
                  <div className="mt-1 text-[11px] text-blue-700">{Math.round(related.score * 100)}% match</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {insights.clusters.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Knowledge Clusters</p>
          <ul className="space-y-2">
            {insights.clusters.map((cluster) => (
              <li key={cluster.id} className="rounded border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-900">{cluster.label}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                    {cluster.kind} · {cluster.noteCount}
                  </span>
                </div>
                {cluster.crossReferences.length > 0 && (
                  <p className="mt-1 text-[11px] text-gray-600">
                    Connected to: {cluster.crossReferences.join(", ")}
                  </p>
                )}
                {cluster.notes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {cluster.notes.slice(0, 2).map((relatedNote) => (
                      <li key={relatedNote.id}>
                        <Link href={`/notes/${relatedNote.id}`} className="text-[11px] text-blue-700 hover:underline">
                          {relatedNote.title || "Untitled note"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {insights.reorganizationSuggestion && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-emerald-700">Reorganization Suggestion</p>
          <p className="mt-1 text-xs text-emerald-900">{insights.reorganizationSuggestion.reason}</p>
          <p className="mt-2 text-[11px] text-emerald-800">
            Confidence: {(insights.reorganizationSuggestion.confidence * 100).toFixed(0)}%
          </p>
          {insights.reorganizationSuggestion.suggestedProject && (
            <p className="mt-1 text-[11px] text-emerald-800">
              Suggested project: <strong>{insights.reorganizationSuggestion.suggestedProject}</strong>
            </p>
          )}
          {insights.reorganizationSuggestion.suggestedCategory && (
            <p className="mt-1 text-[11px] text-emerald-800">
              Suggested category: <strong>{insights.reorganizationSuggestion.suggestedCategory}</strong>
            </p>
          )}
          {insights.reorganizationSuggestion.supportingNotes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {insights.reorganizationSuggestion.supportingNotes.map((relatedNote) => (
                <li key={relatedNote.id}>
                  <Link href={`/notes/${relatedNote.id}`} className="text-[11px] text-emerald-700 hover:underline">
                    {relatedNote.title || "Untitled note"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={handleApplySuggestion}
            disabled={isApplyingSuggestion}
            className="mt-3 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            {isApplyingSuggestion ? "Applying..." : "Apply Cluster Context"}
          </button>
        </div>
      )}
    </div>
  );
}
