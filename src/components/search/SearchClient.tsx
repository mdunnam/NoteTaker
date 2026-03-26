"use client";

import { FormEvent, useState, useRef } from "react";
import AskPanel from "./AskPanel";

interface SearchResult {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: string;
  score: number;
}

/**
 * Client-side Search & Ask experience.
 * Combines semantic search results with the AskPanel.
 */
export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchMethod, setSearchMethod] = useState<"semantic" | "keyword" | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Run a semantic (or keyword fallback) search via the API.
   */
  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch("/api/search/semantic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, limit: 40 }),
      });

      if (!res.ok) throw new Error("Search failed");

      const data = (await res.json()) as {
        results: SearchResult[];
        method: "semantic" | "keyword";
      };

      setResults(data.results);
      setSearchMethod(data.method);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Search & Ask</h1>

      {/* Ask panel sits above search */}
      <AskPanel />

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes by meaning, not just keywords..."
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {/* Results */}
      {hasSearched && !isLoading && (
        <div>
          <p className="mb-3 text-sm text-gray-500">
            {results.length === 0
              ? `No results for "${query}".`
              : `${results.length} result${results.length === 1 ? "" : "s"}${searchMethod === "semantic" ? " (semantic)" : " (keyword)"}`}
          </p>

          {results.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
              <p className="text-lg font-medium">Nothing found</p>
              <p className="mt-1 text-sm">Try rephrasing or use Ask above to get an AI answer.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((note) => (
                <a
                  key={note.id}
                  href={`/notes/${note.id}`}
                  className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-900 line-clamp-1">
                      {note.title || "Untitled note"}
                    </span>
                    {note.score > 0 && (
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        {note.score}% match
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {note.summary || note.rawContent}
                  </p>
                  <p className="mt-2 text-xs text-gray-400">
                    {new Date(note.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Initial empty state */}
      {!hasSearched && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-500">
          <p className="text-lg font-medium">Find anything in your notes</p>
          <p className="mt-1 text-sm">Semantic search understands meaning — try &quot;ideas about marketing&quot; or &quot;tasks due next week&quot;.</p>
        </div>
      )}
    </div>
  );
}
