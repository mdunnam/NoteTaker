import { describe, expect, it } from "vitest";
import {
  buildSearchSnippet,
  rankKeywordCandidates,
  selectTopSemanticCandidates,
  tokenizeSearchQuery,
  type ScoredSearchCandidate,
} from "@/lib/searchRanking";

/**
 * Tests for search ranking utilities.
 */
describe("search ranking utilities", () => {
  it("tokenizes and deduplicates query terms", () => {
    expect(tokenizeSearchQuery("Roadmap roadmap Q2 planning")).toEqual(["roadmap", "q2", "planning"]);
  });

  it("ranks keyword matches by weighted relevance", () => {
    const now = new Date();
    const results = rankKeywordCandidates(
      [
        {
          id: "1",
          title: "Marketing plan",
          summary: "Q2 campaign",
          rawContent: "Draft campaign goals",
          createdAt: now,
          tags: ["marketing"],
        },
        {
          id: "2",
          title: "Random",
          summary: "No match",
          rawContent: "mentions marketing once",
          createdAt: now,
          tags: [],
        },
      ],
      "marketing",
      10
    );

    expect(results.length).toBe(2);
    expect(results[0]?.id).toBe("1");
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("filters semantic candidates by score threshold", () => {
    const now = new Date();
    const input: ScoredSearchCandidate[] = [
      { id: "1", title: null, summary: null, rawContent: "A", createdAt: now, score: 0.82 },
      { id: "2", title: null, summary: null, rawContent: "B", createdAt: now, score: 0.51 },
      { id: "3", title: null, summary: null, rawContent: "C", createdAt: now, score: 0.3 },
    ];

    const output = selectTopSemanticCandidates(input, 5, 0.5);

    expect(output.map((item) => item.id)).toEqual(["1", "2"]);
  });

  it("builds a snippet around the best query hit", () => {
    const now = new Date();
    const snippet = buildSearchSnippet(
      {
        id: "1",
        title: "Launch prep",
        summary: null,
        rawContent: "We need to finalize billing workflows before launch and confirm Stripe retries.",
        createdAt: now,
      },
      "billing"
    );

    expect(snippet.snippet.toLowerCase()).toContain("billing");
    expect(snippet.matchedTerms).toContain("billing");
  });
});
