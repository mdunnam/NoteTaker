"use client";

import { parseNoteAiMeta, type ParsedNoteAiMeta } from "@/lib/clarification";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

interface ClarificationResult {
  id: string;
  summary: string | null;
  confidenceScore: number | null;
  aiMeta: unknown;
}

interface ClarificationFeedbackResult {
  id: string;
  aiMeta: unknown;
}

interface ClarificationLoopProps {
  noteId: string;
  aiMeta: unknown;
  quickHints?: {
    projects: string[];
    contexts: string[];
  };
  compact?: boolean;
  alwaysShowHistory?: boolean;
  onUpdated?: (payload: ClarificationResult, message: string) => void;
}

/**
 * Shared conversational clarification UI for low-confidence notes.
 * Supports both quick hint chips and freeform answers in an iterative loop.
 */
export default function ClarificationLoop({
  noteId,
  aiMeta,
  quickHints,
  compact = false,
  alwaysShowHistory = false,
  onUpdated,
}: ClarificationLoopProps) {
  const router = useRouter();
  const [parsedMeta, setParsedMeta] = useState<ParsedNoteAiMeta>(() => parseNoteAiMeta(aiMeta));
  const [selectedQuestion, setSelectedQuestion] = useState(parsedMeta.clarificationQuestions[0] || "");
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDismissingQuestion, setIsDismissingQuestion] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextMeta = parseNoteAiMeta(aiMeta);
    setParsedMeta(nextMeta);
    setSelectedQuestion((current) => {
      if (current && nextMeta.clarificationQuestions.includes(current)) {
        return current;
      }

      return nextMeta.clarificationQuestions[0] || current || "";
    });
  }, [aiMeta]);

  const shouldRender =
    parsedMeta.clarificationQuestions.length > 0 ||
    parsedMeta.clarificationHistory.length > 0 ||
    alwaysShowHistory;

  if (!shouldRender) {
    return null;
  }

  /** Submit either a freeform answer or a quick-hint clarification turn. */
  const submitClarification = async (
    payload: { answer?: string; projectHint?: string; contextHint?: string },
    successMessage: string
  ) => {
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/notes/${noteId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: selectedQuestion || undefined,
          ...payload,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to clarify note");
      }

      const data = (await response.json()) as ClarificationResult;
      const nextMeta = parseNoteAiMeta(data.aiMeta);
      setParsedMeta(nextMeta);
      setSelectedQuestion(nextMeta.clarificationQuestions[0] || "");
      setAnswer("");
      setMessage(onUpdated ? null : successMessage);
      onUpdated?.(data, successMessage);
      router.refresh();
    } catch (submitError) {
      console.error("Error clarifying note:", submitError);
      setError("Could not apply clarification.");
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Dismiss one clarification question as not useful and refresh the note-local question list. */
  const dismissQuestion = async (question: string) => {
    setIsDismissingQuestion(question);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/notes/${noteId}/clarify-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, action: "dismiss" }),
      });

      if (!response.ok) {
        throw new Error("Failed to record clarification feedback");
      }

      const data = (await response.json()) as ClarificationFeedbackResult;
      const nextMeta = parseNoteAiMeta(data.aiMeta);
      setParsedMeta(nextMeta);
      setSelectedQuestion((current) => {
        if (current && current !== question && nextMeta.clarificationQuestions.includes(current)) {
          return current;
        }

        return nextMeta.clarificationQuestions[0] || "";
      });
      setMessage("Marked that question as not useful.");
      router.refresh();
    } catch (dismissError) {
      console.error("Error dismissing clarification question:", dismissError);
      setError("Could not dismiss this clarification question.");
    } finally {
      setIsDismissingQuestion(null);
    }
  };

  /** Submit the current freeform answer into the clarification conversation. */
  const handleSubmitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) {
      return;
    }

    await submitClarification({ answer: trimmedAnswer }, "Saved clarification answer.");
  };

  const historyToShow = compact
    ? parsedMeta.clarificationHistory.slice(-2)
    : parsedMeta.clarificationHistory.slice(-4);

  return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50 ${compact ? "p-3" : "p-4"}`}>
      <p className={`font-semibold text-amber-800 ${compact ? "text-[11px]" : "text-xs"}`}>
        {parsedMeta.clarificationHistory.length > 0 ? "Clarification conversation" : "AI needs clarification"}
      </p>

      {parsedMeta.clarificationQuestions.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {parsedMeta.clarificationQuestions.map((question) => (
            <li key={question} className="flex items-start justify-between gap-3">
              <span className={`${compact ? "text-xs" : "text-sm"} text-amber-900`}>
                • {question}
              </span>
              <button
                type="button"
                disabled={isSubmitting || isDismissingQuestion !== null}
                onClick={() => void dismissQuestion(question)}
                className="shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                {isDismissingQuestion === question ? "Saving..." : "Not useful"}
              </button>
            </li>
          ))}
        </ul>
      ) : parsedMeta.clarificationHistory.length > 0 ? (
        <p className={`mt-2 text-amber-800 ${compact ? "text-[11px]" : "text-xs"}`}>
          No further clarification questions right now. You can still add more context below.
        </p>
      ) : null}

      {historyToShow.length > 0 && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-100 bg-white/70 p-3">
          {historyToShow.map((turn, index) => (
            <div key={`${turn.createdAt}-${index}`}>
              <p className="text-[11px] font-medium text-amber-900">Q: {turn.question}</p>
              <p className={`mt-0.5 text-amber-800 ${compact ? "text-[11px]" : "text-xs"}`}>A: {turn.answer}</p>
            </div>
          ))}
        </div>
      )}

      {quickHints?.projects && quickHints.projects.length > 0 && (
        <div className="mt-3">
          <p className={`mb-1 font-medium text-amber-800 ${compact ? "text-[11px]" : "text-xs"}`}>Quick project hints</p>
          <div className="flex flex-wrap gap-1">
            {quickHints.projects.map((project) => (
              <button
                key={`clarify-project-${project}`}
                type="button"
                disabled={isSubmitting || isDismissingQuestion !== null}
                onClick={() => void submitClarification({ projectHint: project }, `Applied project hint: ${project}`)}
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
          <p className={`mb-1 font-medium text-amber-800 ${compact ? "text-[11px]" : "text-xs"}`}>Quick context hints</p>
          <div className="flex flex-wrap gap-1">
            {quickHints.contexts.map((context) => (
              <button
                key={`clarify-context-${context}`}
                type="button"
                disabled={isSubmitting || isDismissingQuestion !== null}
                onClick={() => void submitClarification({ contextHint: context }, `Applied context hint: ${context}`)}
                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                {context}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmitAnswer} className="mt-3 space-y-2">
        {parsedMeta.clarificationQuestions.length > 1 && (
          <select
            value={selectedQuestion}
            onChange={(event) => setSelectedQuestion(event.target.value)}
            disabled={isDismissingQuestion !== null}
            className="w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-xs text-amber-900"
          >
            {parsedMeta.clarificationQuestions.map((question) => (
              <option key={question} value={question}>{question}</option>
            ))}
          </select>
        )}

        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={isDismissingQuestion !== null}
          rows={compact ? 2 : 3}
          placeholder={selectedQuestion || "Add more context to help QNote re-organize this note..."}
          className="w-full resize-y rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-amber-800">
            Answer directly in natural language. QNote will re-organize the note and ask narrower follow-ups if needed.
          </p>
          <button
            type="submit"
            disabled={isSubmitting || isDismissingQuestion !== null || !answer.trim()}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {isSubmitting ? "Saving..." : "Send answer"}
          </button>
        </div>
      </form>

      {message && <p className="mt-2 text-[11px] text-green-700">{message}</p>}
      {error && <p className="mt-2 text-[11px] text-red-700">{error}</p>}
    </div>
  );
}