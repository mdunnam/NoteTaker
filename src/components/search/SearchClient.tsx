"use client";

import Link from "next/link";
import { FormEvent, startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import AskPanel from "./AskPanel";

interface SearchFilterOptions {
  categories: string[];
  types: string[];
  tags: string[];
}

interface SearchFilters {
  category?: string;
  type?: string;
  tag?: string;
  dateRange?: "all" | "7d" | "30d" | "90d" | "365d";
}

interface SearchResult {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: string;
  category: string | null;
  type: string | null;
  tags: string[];
  suggestedProject: string | null;
  snippet: string;
  matchedTerms: string[];
  score: number;
}

interface SearchResponse {
  results: SearchResult[];
  method: "semantic" | "keyword";
}

interface SearchClientProps {
  filterOptions: SearchFilterOptions;
}

/** Escape text for safe regex construction. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highlight matched search terms in a returned snippet. */
function renderHighlightedSnippet(snippet: string, matchedTerms: string[]) {
  if (!snippet || matchedTerms.length === 0) {
    return snippet;
  }

  const uniqueTerms = [...new Set(matchedTerms)].sort((left, right) => right.length - left.length);
  const matcher = new RegExp(`(${uniqueTerms.map((term) => escapeRegExp(term)).join("|")})`, "ig");
  const parts = snippet.split(matcher);

  return parts.map((part, index) => {
    const isMatch = uniqueTerms.some((term) => term.toLowerCase() === part.toLowerCase());
    return isMatch ? (
      <mark key={`${part}-${index}`} className="rounded bg-amber-100 px-0.5 text-gray-900">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    );
  });
}

/** Normalize UI filter state into API payload shape. */
function buildFilters(filters: Required<SearchFilters>): SearchFilters {
  return {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.tag ? { tag: filters.tag } : {}),
    ...(filters.dateRange && filters.dateRange !== "all" ? { dateRange: filters.dateRange } : {}),
  };
}

/**
 * Client-side Search & Ask experience with semantic search, keyword fallback, and filter controls.
 */
export default function SearchClient({ filterOptions }: SearchClientProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [searchMethod, setSearchMethod] = useState<"semantic" | "keyword" | null>(null);
  const [searchMode, setSearchMode] = useState<"semantic" | "keyword">("semantic");
  const [hasSearched, setHasSearched] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Required<SearchFilters>>({
    category: "",
    type: "",
    tag: "",
    dateRange: "all",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  /** Execute a search request using the current mode and filters. */
  const runSearch = async (nextQuery?: string) => {
    const trimmed = (nextQuery ?? query).trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError("");
    setHasSearched(true);
    setShowSuggestions(false);

    try {
      const response = await fetch("/api/search/semantic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          limit: 40,
          mode: searchMode,
          filters: buildFilters(filters),
        }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const payload = (await response.json()) as SearchResponse;
      startTransition(() => {
        setResults(payload.results);
        setSearchMethod(payload.method);
      });
    } catch (searchError) {
      console.error("Search error:", searchError);
      setResults([]);
      setSearchMethod(null);
      setError("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const response = await fetch("/api/search/semantic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            limit: 5,
            mode: searchMode,
            filters: buildFilters(filters),
            typeahead: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Suggestion lookup failed");
        }

        const payload = (await response.json()) as SearchResponse;
        startTransition(() => {
          setSuggestions(payload.results);
          setShowSuggestions(payload.results.length > 0);
        });
      } catch (suggestionError) {
        if (!controller.signal.aborted) {
          console.error("Suggestion error:", suggestionError);
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingSuggestions(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [deferredQuery, searchMode, filters]);

  /** Submit the main search form. */
  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    await runSearch();
  };

  const activeFilters = [
    filters.category ? { key: "category", label: `Category: ${filters.category}` } : null,
    filters.type ? { key: "type", label: `Type: ${filters.type}` } : null,
    filters.tag ? { key: "tag", label: `Tag: #${filters.tag}` } : null,
    filters.dateRange !== "all" ? { key: "dateRange", label: `Date: ${filters.dateRange}` } : null,
  ].filter(Boolean) as Array<{ key: keyof SearchFilters; label: string }>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Search Your Notes</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Search by meaning first, then fall back to exact keyword mode when you need tighter literal matches.
        </p>
      </div>

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSearchMode("semantic")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              searchMode === "semantic"
                ? "bg-blue-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Semantic
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("keyword")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              searchMode === "keyword"
                ? "bg-blue-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            Keyword
          </button>
          <span className="text-xs text-gray-500">
            {searchMode === "semantic"
              ? "Best for meaning, concepts, and loosely related notes"
              : "Best for exact wording, tags, and literal matches"}
          </span>
        </div>

        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setShowSuggestions(suggestions.length > 0)}
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                placeholder={searchMode === "semantic"
                  ? "Try 'billing issues', 'fundraising ideas', or 'notes about launch blockers'"
                  : "Search exact words, tags, or phrases..."}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? "Searching..." : "Search"}
              </button>
            </div>

            {showSuggestions && deferredQuery.trim().length >= 2 && (
              <div className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                {isLoadingSuggestions ? (
                  <p className="px-4 py-3 text-sm text-gray-500">Looking for relevant notes...</p>
                ) : suggestions.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No suggestions yet.</p>
                ) : (
                  <ul className="py-2">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.id}>
                        <Link
                          href={`/notes/${suggestion.id}`}
                          className="block px-4 py-2 hover:bg-gray-50"
                        >
                          <p className="text-sm font-medium text-gray-900">{suggestion.title || "Untitled note"}</p>
                          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{suggestion.snippet || suggestion.summary || suggestion.rawContent}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <select
              value={filters.category}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {filterOptions.categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <select
              value={filters.type}
              onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              {filterOptions.types.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <select
              value={filters.tag}
              onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All tags</option>
              {filterOptions.tags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>

            <select
              value={filters.dateRange}
              onChange={(event) => setFilters((current) => ({
                ...current,
                dateRange: event.target.value as Required<SearchFilters>["dateRange"],
              }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="365d">Last year</option>
            </select>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, [filter.key]: filter.key === "dateRange" ? "all" : "" }))}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                >
                  {filter.label} ×
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFilters({ category: "", type: "", tag: "", dateRange: "all" })}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </form>
      </section>

      <AskPanel />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {hasSearched && !isLoading && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-500">
              {results.length === 0
                ? `No results for "${query}".`
                : `${results.length} result${results.length === 1 ? "" : "s"} using ${searchMethod || searchMode} search`}
            </p>
            {searchMethod && searchMethod !== searchMode && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                Used {searchMethod} fallback
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-500">
              <p className="text-lg font-medium text-gray-700">Nothing matched yet</p>
              <p className="mt-2 text-sm">Try a broader concept, remove a filter, or switch between semantic and keyword mode.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((note) => (
                <Link
                  key={note.id}
                  href={`/notes/${note.id}`}
                  className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-semibold text-gray-900">{note.title || "Untitled note"}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        {note.category && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{note.category}</span>}
                        {note.type && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{note.type}</span>}
                        <span>
                          {new Date(note.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        {note.suggestedProject && <span>Project: {note.suggestedProject}</span>}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                      {note.score}%
                    </span>
                  </div>

                  <p className="text-sm leading-6 text-gray-700">
                    {renderHighlightedSnippet(note.snippet || note.summary || note.rawContent, note.matchedTerms)}
                  </p>

                  {note.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {note.tags.slice(0, 6).map((tag) => (
                        <span key={`${note.id}-${tag}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {!hasSearched && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-500">
          <p className="text-lg font-medium text-gray-700">Search by meaning or by literal match</p>
          <p className="mt-2 text-sm">
            Try “billing issues”, “notes about launch blockers”, or switch to keyword mode for exact phrase matches.
          </p>
        </div>
      )}
    </div>
  );
}
