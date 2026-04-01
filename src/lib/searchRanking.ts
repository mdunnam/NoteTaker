/**
 * Utility functions for ranking search candidates.
 */

export interface SearchCandidate {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: Date;
  category?: string | null;
  type?: string | null;
  tags?: string[];
  suggestedProject?: string | null;
}

export interface ScoredSearchCandidate extends SearchCandidate {
  score: number;
}

export interface SearchSnippet {
  snippet: string;
  matchedTerms: string[];
}

/** Normalize a free-text query into deduplicated lowercase search terms. */
export function tokenizeSearchQuery(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
  )];
}

/** Score a single candidate for keyword relevance. */
export function scoreKeywordCandidate(candidate: SearchCandidate, query: string): number {
  const queryLower = query.toLowerCase();
  const terms = tokenizeSearchQuery(query);
  const title = candidate.title?.toLowerCase() || "";
  const summary = candidate.summary?.toLowerCase() || "";
  const rawContent = candidate.rawContent.toLowerCase();

  let score = 0;

  if (title.includes(queryLower)) score += 8;
  if (summary.includes(queryLower)) score += 5;
  if (rawContent.includes(queryLower)) score += 3;

  for (const term of terms) {
    if (title.includes(term)) score += 2;
    if (summary.includes(term)) score += 1.5;
    if (rawContent.includes(term)) score += 0.75;
    if (candidate.tags?.some((tag) => tag.toLowerCase() === term)) score += 2;
    if (candidate.category?.toLowerCase() === term) score += 1.5;
    if (candidate.type?.toLowerCase() === term) score += 1.5;
    if (candidate.suggestedProject?.toLowerCase().includes(term)) score += 1.5;
  }

  return score;
}

/** Build a readable snippet centered around the best keyword hit, with fallback to summary/body start. */
export function buildSearchSnippet(candidate: SearchCandidate, query: string, maxLength = 180): SearchSnippet {
  const source = (candidate.summary || candidate.rawContent || candidate.title || "").replace(/\s+/g, " ").trim();
  if (!source) {
    return { snippet: "", matchedTerms: [] };
  }

  const queryLower = query.toLowerCase();
  const sourceLower = source.toLowerCase();
  const terms = tokenizeSearchQuery(query);

  let matchIndex = sourceLower.indexOf(queryLower);
  if (matchIndex === -1) {
    for (const term of terms) {
      const termIndex = sourceLower.indexOf(term);
      if (termIndex !== -1) {
        matchIndex = termIndex;
        break;
      }
    }
  }

  if (matchIndex === -1) {
    return {
      snippet: source.length > maxLength ? `${source.slice(0, maxLength - 1).trim()}...` : source,
      matchedTerms: [],
    };
  }

  const start = Math.max(0, matchIndex - Math.floor(maxLength / 3));
  const end = Math.min(source.length, start + maxLength);
  const slice = source.slice(start, end).trim();
  const prefix = start > 0 ? "..." : "";
  const suffix = end < source.length ? "..." : "";

  return {
    snippet: `${prefix}${slice}${suffix}`,
    matchedTerms: terms.filter((term) => sourceLower.includes(term)),
  };
}

/**
 * Rank candidates by keyword relevance.
 */
export function rankKeywordCandidates(
  candidates: SearchCandidate[],
  query: string,
  limit: number
): ScoredSearchCandidate[] {
  return candidates
    .map((candidate) => ({ ...candidate, score: scoreKeywordCandidate(candidate, query) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Keep only candidates above a minimum semantic score.
 */
export function selectTopSemanticCandidates(
  candidates: ScoredSearchCandidate[],
  limit: number,
  minScore = 0.5
): ScoredSearchCandidate[] {
  return candidates
    .filter((candidate) => candidate.score > minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
