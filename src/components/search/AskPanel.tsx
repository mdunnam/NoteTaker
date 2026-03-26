"use client";

import { FormEvent, useState } from "react";

interface AskResponse {
  answer: string;
  sources: Array<{
    id: string;
    title: string | null;
    createdAt: string;
  }>;
}

/**
 * AskPanel allows asking natural-language questions over saved notes.
 */
export default function AskPanel() {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);

  /**
   * Submit a question to the notes QA endpoint.
   */
  const handleAsk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/search/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmedQuestion }),
      });

      const data = (await response.json()) as AskResponse | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Failed to get answer");
      }

      setResult(data);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Something went wrong";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Ask Your Notes</h2>

      <form onSubmit={handleAsk} className="space-y-3">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask anything about your saved notes..."
          className="min-h-24 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
        />

        <button
          type="submit"
          disabled={isLoading || !question.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="whitespace-pre-wrap text-sm text-gray-900">{result.answer}</p>

          {result.sources.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Sources</h3>
              <ul className="space-y-1">
                {result.sources.map((source) => (
                  <li key={source.id}>
                    <a
                      href={`/notes/${source.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {source.title || "Untitled note"} &rarr;
                    </a>
                    <span className="ml-1 text-xs text-gray-500">
                      {new Date(source.createdAt).toLocaleDateString("en-US")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
