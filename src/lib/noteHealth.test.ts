import { describe, expect, it } from "vitest";
import { getNoteHealthAssessment, summarizeWorkspaceHealth, type NoteHealthInput } from "@/lib/noteHealth";

function makeNote(overrides: Partial<NoteHealthInput>): NoteHealthInput {
  return {
    id: "n1",
    title: "Test note",
    summary: "A useful summary",
    category: "Work",
    type: "TASK",
    status: "PROCESSED",
    confidenceScore: 0.9,
    priority: "medium",
    suggestedProject: "QNote",
    aiMeta: { clarificationQuestions: [] },
    extractedTasks: [],
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    ...overrides,
  };
}

describe("note health", () => {
  it("flags a stale low-confidence high-priority note as at risk", () => {
    const assessment = getNoteHealthAssessment(
      makeNote({
        confidenceScore: 0.32,
        priority: "high",
        suggestedProject: null,
        aiMeta: { clarificationQuestions: ["Which project is this for?"] },
        updatedAt: new Date("2026-03-20T00:00:00.000Z"),
        extractedTasks: [{ text: "Follow up" }],
      }),
      new Date("2026-04-04T00:00:00.000Z")
    );

    expect(assessment.state).toBe("at-risk");
    expect(assessment.score).toBeLessThan(50);
    expect(assessment.needsClarification).toBe(true);
  });

  it("treats a recent high-confidence note as healthy", () => {
    const assessment = getNoteHealthAssessment(
      makeNote({
        confidenceScore: 0.91,
        updatedAt: new Date("2026-04-03T00:00:00.000Z"),
      }),
      new Date("2026-04-04T00:00:00.000Z")
    );

    expect(assessment.state).toBe("healthy");
    expect(assessment.score).toBeGreaterThanOrEqual(75);
  });

  it("summarizes workspace health across notes", () => {
    const summary = summarizeWorkspaceHealth([
      makeNote({ confidenceScore: 0.91 }),
      makeNote({ id: "n2", confidenceScore: 0.62, aiMeta: { clarificationQuestions: ["Which project is this for?"] } }),
      makeNote({ id: "n3", confidenceScore: 0.3, priority: "high", suggestedProject: null, updatedAt: new Date("2026-03-20T00:00:00.000Z") }),
    ], new Date("2026-04-04T00:00:00.000Z"));

    expect(summary.healthyCount).toBe(1);
    expect(summary.watchCount).toBe(1);
    expect(summary.atRiskCount).toBe(1);
  });
});