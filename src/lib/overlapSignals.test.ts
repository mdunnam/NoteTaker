import { describe, expect, it } from "vitest";

import {
  buildContextAwareResurfacing,
  buildDuplicateSuggestion,
  parseDuplicateSuggestion,
} from "./overlapSignals";

describe("buildDuplicateSuggestion", () => {
  it("returns the strongest candidate above the duplicate threshold", () => {
    const duplicate = buildDuplicateSuggestion(
      { suggestedProject: "QNote", category: "Work" },
      [
        {
          id: "n1",
          title: "Older billing note",
          summary: "Invoice cleanup",
          createdAt: "2026-04-01T00:00:00.000Z",
          suggestedProject: "QNote",
          category: "Work",
          score: 0.94,
        },
        {
          id: "n2",
          title: "Weaker overlap",
          summary: null,
          createdAt: "2026-04-02T00:00:00.000Z",
          suggestedProject: null,
          category: null,
          score: 0.91,
        },
      ]
    );

    expect(duplicate?.note.id).toBe("n1");
    expect(duplicate?.reason).toContain("shared project QNote and Work context");
  });

  it("returns null when no candidate clears the threshold", () => {
    const duplicate = buildDuplicateSuggestion(
      { suggestedProject: null, category: null },
      [
        {
          id: "n1",
          title: "Loose match",
          summary: null,
          createdAt: "2026-04-01T00:00:00.000Z",
          suggestedProject: null,
          category: null,
          score: 0.88,
        },
      ]
    );

    expect(duplicate).toBeNull();
  });
});

describe("buildContextAwareResurfacing", () => {
  it("returns only older notes with the strongest overlap reasons", () => {
    const matches = buildContextAwareResurfacing(
      "2026-04-06T00:00:00.000Z",
      { suggestedProject: "QNote", category: "Work" },
      [
        {
          id: "older-1",
          title: "Earlier roadmap note",
          summary: "Planning",
          createdAt: "2026-04-05T00:00:00.000Z",
          suggestedProject: "QNote",
          category: "Work",
          score: 0.87,
        },
        {
          id: "newer",
          title: "Future note",
          summary: null,
          createdAt: "2026-04-07T00:00:00.000Z",
          suggestedProject: "QNote",
          category: "Work",
          score: 0.99,
        },
      ]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.note.id).toBe("older-1");
    expect(matches[0]?.reason).toContain("Earlier note with 87% semantic overlap");
  });
});

describe("parseDuplicateSuggestion", () => {
  it("parses a persisted duplicate suggestion payload", () => {
    const parsed = parseDuplicateSuggestion({
      note: {
        id: "n1",
        title: "Possible duplicate",
        summary: "Overlap",
        createdAt: "2026-04-01T00:00:00.000Z",
      },
      score: 0.93,
      reason: "93% overlap with an earlier note.",
    });

    expect(parsed?.note.id).toBe("n1");
    expect(parsed?.score).toBe(0.93);
  });

  it("returns null for malformed payloads", () => {
    expect(parseDuplicateSuggestion({ note: { id: "n1" } })).toBeNull();
  });
});