/**
 * Utility functions for ranking search candidates.
 */

export interface SearchCandidate {
  id: string;
  title: string | null;
  summary: string | null;
  rawContent: string;
  createdAt: Date;
}

export interface ScoredSearchCandidate extends SearchCandidate {
  score: number;
}

/**
 * Rank candidates by keyword relevance.
 */
export function rankKeywordCandidates(
  candidates: SearchCandidate[],
  query: string,
  limit: number
): ScoredSearchCandidate[] {
  const queryLower = query.toLowerCase();

  return candidates
    .map((candidate) => {
      let score = 0;
      if (candidate.title?.toLowerCase().includes(queryLower)) score += 3;
      if (candidate.summary?.toLowerCase().includes(queryLower)) score += 2;
      if (candidate.rawContent.toLowerCase().includes(queryLower)) score += 1;
      return { ...candidate, score };
    })
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
